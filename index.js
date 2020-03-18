const toTiming = (bpm, beat) => ({ "type": "System", "cmd": "BPM", bpm, beat });
const toNote = (lane, beat, other) => ({ "type": "Note", "note": "Single", lane, beat, ...other });
const toSlide = (lane, beat, pos, other) => ({ "type": "Note", "note": "Slide", pos, lane, beat, ...other });

const convert = async (osuFileContents, onError, options) => {
  const convertHolds = options?.convertHolds ?? true;
  const flickFinishes = options?.flickFinishes ?? true;
  const file = await new OsuFile(osuFileContents);
  const data = [];

  const timings = file.getTimingPoints();

  const timingPoint = timings[0];

  let offsetbpm = 240;
  let offseterror = Infinity;
  for (let i = 100; i <= 255; i++) {
    const msPerBeat = 60 * 1000 / i;
    const error = Math.min(timingPoint.offset % msPerBeat, msPerBeat - (timingPoint.offset % msPerBeat));
    if (error < offseterror) {
      offsetbpm = i;
      offseterror = error;
    }
  }

  onError("Offset has an error of " + offseterror + "ms");

  const beat = 0;
  data.push(toTiming(offsetbpm, 0)); // first timing point must start at 0
  const offsetBeat = Math.round(timingPoint.offset / (60 * 1000 / offsetbpm));
  const bpm = Math.round(60 * 1000 / timingPoint.msPerBeat);
  data.push(toTiming(bpm, offsetBeat));

  let lastA = 0;
  let lastB = 0;

  const snapDivisor = 48;

  for (let object of file.getHitObjects()) {
    const lane = Math.round(7 * object.x / 512 + 0.5);
    const beat = Math.round(snapDivisor * (object.time - timingPoint.offset) / timingPoint.msPerBeat) / snapDivisor + offsetBeat;
    const flick = (flickFinishes && (object.hitSound & 2) > 0) || undefined; // finish

    if (convertHolds && object instanceof HoldNote) {
      const endBeat = Math.round(snapDivisor * (object.endTime - timingPoint.offset) / timingPoint.msPerBeat) / snapDivisor + offsetBeat;
      if (lastA < beat) {
        data.push(toSlide(lane, beat, "A", { start: true }));
        data.push(toSlide(lane, endBeat, "A", { end: true }));
        lastA = endBeat;
      } else if (lastB < beat) {
        data.push(toSlide(lane, beat, "B", { start: true }));
        data.push(toSlide(lane, endBeat, "B", { end: true }));
        lastB = endBeat;
      } else {
        data.push(toNote(lane, beat));
        onError("Too many holds at " + object.time);
      }
    } else {
      data.push(toNote(lane, beat, { flick }));
    }
  }

  return JSON.stringify(data);
}

/** @type {HTMLInputElement} */
const fileInput = document.getElementById('fileInput');

/** @type {HTMLTextAreaElement} */
const inputData = document.getElementById('inputData');
/** @type {HTMLTextAreaElement} */
const outputData = document.getElementById('outputData');
/** @type {HTMLTextAreaElement} */
const errorData = document.getElementById('errorData');
/** @type {HTMLInputElement} */
const convertHolds = document.getElementById('convertHolds');
/** @type {HTMLInputElement} */
const flickFinishes = document.getElementById('flickFinishes');



const reconvert = async () => {
  let options = {
    convertHolds: convertHolds.checked,
    flickFinishes: flickFinishes.checked,
  }
  errorData.value = '';
  if (!inputData.value) return;
  outputData.value = await convert(inputData.value, (err) => errorData.value += err + '\n', options);
}

fileInput.addEventListener('change', async () => {
  inputData.value = await fileInput.files[0].text();
  fileInput.value = "";
  await reconvert();
})
inputData.addEventListener('change', reconvert);
convertHolds.addEventListener('change', reconvert);
flickFinishes.addEventListener('change', reconvert);

let dropbox;

dropbox = document.documentElement;
const defaultHandler = (e) => {
  e.stopPropagation();
  e.preventDefault();
}
dropbox.addEventListener("dragenter", defaultHandler, false);
dropbox.addEventListener("dragover", defaultHandler, false);
dropbox.addEventListener("drop", async (e) => {
  defaultHandler(e);
  const dt = e.dataTransfer;
  const files = dt.files;
  inputData.value = await files[0].text();
  await reconvert();
}, false);