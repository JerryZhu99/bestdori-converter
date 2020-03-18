class OsuFile {
  /**
   * Reads an .osu file asynchronously.
   * @param {string} osupath
   * @returns {Promise<OsuFile>}
   */
  static fromFile(osupath) {
    return new Promise((resolve, reject) => {
      const filename = path.parse(osupath).base;
      const dirs = path.dirname(osupath).split(path.sep);
      const dirname = dirs.pop();
      const songsDirectory = path.join(...dirs);
      fs.readFile(osupath, (err, data) => {
        if (err)
          return reject(err);
        resolve(new OsuFile(data, filename, dirname, songsDirectory));
      });
    });
  }
  /**
   * Constucts a new OsuFile instance.
   * @param {Buffer} data
   * @param {string} filename
   * @param {string} dirname
   * @param {string} songsDirectory
   */
  constructor(data, filename, dirname, songsDirectory) {
    if (data)
      this.lines = data.toString("UTF-8").split("\n");
    this.filename = filename;
    this.dirname = dirname;
    this.songsDirectory = songsDirectory;
  }
  getVersion() {
    return parseInt(this.lines[0].match(/\d+/)[0]);
  }
  setVersion(version) {
    this.lines[0] = `osu file format v${version}`;
  }
  /**
   * Gets a property from an osu file.
   * @param {string} name the name of the property
   * @param {string=} defaultValue the default value
   */
  getProperty(name, defaultValue) {
    let line = this.lines.find(e => e.startsWith(name));
    return line ? line.slice(line.indexOf(":") + 1).trim() : defaultValue;
  }
  /**
   * Sets a property of an osu file.
   * @param {string} data the contents of the .osu file
   * @param {string} name the name of the property
   */
  setProperty(name, value) {
    let index = this.lines.findIndex(e => e.startsWith(name));
    if (index == -1)
      return -1;
    this.lines[index] = `${this.lines[index].slice(0, this.lines[index].indexOf(":"))}: ${value}`;
  }

  appendToDiffName(postfix) {
    this.filename = `${this.filename.substring(0, this.filename.lastIndexOf("]"))} ${postfix}].osu`;
  }

  getTimingPoints() {
    let timingPointsIndex = this.lines.findIndex(e => e.startsWith("[TimingPoints]"));
    let timingPointsEndIndex = this.lines.findIndex((e, i) => i > timingPointsIndex && e.startsWith("["));
    return this.lines
      .filter((e, i) => (timingPointsIndex < i && i < timingPointsEndIndex))
      .filter(e => e.trim() !== "")
      .map(e => TimingPoint.fromString(e));
  }

  setTimingPoints(timingPoints) {
    let timingPointsIndex = this.lines.findIndex(e => e.startsWith("[TimingPoints]"));
    let timingPointsEndIndex = this.lines.findIndex((e, i) => i > timingPointsIndex && e.startsWith("["));
    this.lines.splice(
      timingPointsIndex + 1,
      timingPointsEndIndex - timingPointsIndex - 1,
      ...(timingPoints
        .sort((a, b) => (a.offset - b.offset))
        .map(e => e.toString())),
      "",
    );
  }

  getTimingPointAt(time) {
    return this.getTimingPoints()
      .reverse()
      .find(e => Math.floor(e.offset) <= time);
  }

  getMainBPM() {
    let bpms = new Map();
    this.getTimingPoints().filter(point => point.msPerBeat > 0)
      .forEach((point, i, arr) => {
        let endTime = Infinity;
        if (i + 1 >= arr.length) {
          endTime = this.getHitObjects().pop().time;
        } else {
          endTime = arr[i + 1].offset;
        }
        let duration = endTime - point.offset;
        if (!bpms.has(point.msPerBeat)) {
          bpms.set(point.msPerBeat, 0);
        }
        bpms.set(point.msPerBeat, bpms.get(point.msPerBeat) + duration);
      });
    let mainBpm = 60000 / [...bpms.entries()]
      .reduce(([mainMsPerBeat, maxCount], [msPerBeat, count]) => {
        return count > maxCount ? [msPerBeat, count] : [mainMsPerBeat, maxCount];
      }, [0, 0])[0];
    return mainBpm;
  }

  getHitObjects() {
    let hitObjectsIndex = this.lines.findIndex(e => e.startsWith("[HitObjects]"));
    let hitObjectsEndIndex = this.lines.length;
    return this.lines
      .filter((e, i) => (hitObjectsIndex < i && i < hitObjectsEndIndex))
      .filter(e => e.trim() !== "")
      .map(e => HitObject.fromString(e));
  }

  /**
   * @param {HitObject[]} hitObjects
   */
  setHitObjects(hitObjects) {
    let hitObjectsIndex = this.lines.findIndex(e => e.startsWith("[HitObjects]"));
    let hitObjectsEndIndex = this.lines.length;
    this.lines.splice(
      hitObjectsIndex + 1,
      hitObjectsEndIndex - hitObjectsIndex - 1,
      ...(hitObjects
        .sort((a, b) => (a.time - b.time))
        .map(e => e.toString())),
      ""
    );
  }

  getComboAt(time) {
    const sliderMultiplier = parseFloat(this.getProperty("SliderMultiplier", "1.4"));
    const sliderTickRate = parseFloat(this.getProperty("SliderTickRate", "1"));
    const hitObjects = this.getHitObjects().filter(e => e.time < time);
    let combo = 0;
    for (const hitObject of hitObjects) {
      if (hitObject instanceof HitCircle) {
        combo += 1;
      } else if (hitObject instanceof Slider) {
        let svMultiplier = 1.0;
        let timingPoint = this.getTimingPointAt(hitObject.time);
        if (timingPoint.msPerBeat < 0) svMultiplier = -100.0 / timingPoint.msPerBeat;
        const epsilon = 0.1;
        let pixelsPerBeat = 0;
        if (this.getVersion() < 8) {
          pixelsPerBeat = sliderMultiplier * 100.0;
        } else {
          pixelsPerBeat = sliderMultiplier * 100.0 * svMultiplier;
        }
        let numBeats = hitObject.pixelLength * hitObject.repeat / pixelsPerBeat;
        let ticks = Math.ceil((numBeats - epsilon) / hitObject.repeat * sliderTickRate) - 1;
        ticks = Math.max(0, ticks);
        combo += ticks * hitObject.repeat;
        combo += hitObject.repeat;
        combo += 1;
      } else if (hitObject instanceof Spinner) {
        combo += 1;
      }
    }
    return combo;
  }


  toString() {
    return this.lines.join("\n");
  }
  clone() {
    const copy = new OsuFile(null, this.filename, this.dirname, this.songsDirectory);
    copy.lines = this.lines.slice();
    return copy;
  }
}
