const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const playerSection = document.getElementById("player");
const preview = document.getElementById("preview");
const playBtn = document.getElementById("play-btn");
const timeLabel = document.getElementById("time-label");
const speedSlider = document.getElementById("speed-slider");
const pitchSlider = document.getElementById("pitch-slider");
const speedValue = document.getElementById("speed-value");
const pitchValue = document.getElementById("pitch-value");
const lockBtn = document.getElementById("lock-btn");

let mediaElement = null;
let mediaSourceNode = null;
let pitchShift = null;
let currentObjectUrl = null;
let rafId = null;
let isLocked = true;

const formatMultiplier = (value) => `${Number(value).toFixed(2)}×`;

const formatTime = (time) => {
  if (!Number.isFinite(time)) return "00:00";
  const minutes = Math.floor(time / 60)
    .toString()
    .padStart(2, "0");
  const seconds = Math.floor(time % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const ratioToSemitone = (ratio) => Math.log2(ratio) * 12;

const stopTicker = () => {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

const tick = () => {
  if (!mediaElement) return;
  timeLabel.textContent = `${formatTime(mediaElement.currentTime)} / ${formatTime(
    mediaElement.duration
  )}`;
  rafId = requestAnimationFrame(tick);
};

const resetAudioGraph = () => {
  if (mediaSourceNode) {
    try {
      mediaSourceNode.disconnect();
    } catch (err) {
      console.warn("mediaSource disconnect", err);
    }
    mediaSourceNode = null;
  }
  if (pitchShift) {
    pitchShift.dispose();
    pitchShift = null;
  }
};

const connectAudioGraph = async (element) => {
  await Tone.start();
  resetAudioGraph();
  const rawContext = Tone.getContext().rawContext;
  mediaSourceNode = rawContext.createMediaElementSource(element);
  pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.1 }).toDestination();
  mediaSourceNode.connect(pitchShift.input);
  element.muted = true;
};

const clearPreview = () => {
  preview.innerHTML = "";
  stopTicker();
  playBtn.textContent = "تشغيل";
  playBtn.disabled = true;
  timeLabel.textContent = "00:00 / 00:00";
  resetAudioGraph();
  if (mediaElement) {
    mediaElement.pause();
    mediaElement.src = "";
    mediaElement.load();
    mediaElement = null;
  }
  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
};

const setupMediaElement = async (file) => {
  clearPreview();

  const url = URL.createObjectURL(file);
  currentObjectUrl = url;
  const isVideo = file.type.startsWith("video");
  const element = document.createElement(isVideo ? "video" : "audio");
  element.src = url;
  element.controls = true;
  element.playsInline = true;
  element.preload = "auto";
  element.crossOrigin = "anonymous";

  preview.appendChild(element);
  playerSection.hidden = false;
  mediaElement = element;

  element.addEventListener("loadedmetadata", () => {
    playBtn.disabled = false;
    timeLabel.textContent = `${formatTime(0)} / ${formatTime(element.duration)}`;
  });

  element.addEventListener("ended", () => {
    playBtn.textContent = "تشغيل";
    stopTicker();
  });

  playBtn.textContent = "تشغيل";

  await connectAudioGraph(element);
  applySpeed(Number(speedSlider.value));
  applyPitch(Number(pitchSlider.value));
};

const applySpeed = (value, { fromLock = false } = {}) => {
  if (mediaElement) {
    mediaElement.playbackRate = value;
  }
  speedSlider.value = value;
  speedValue.textContent = formatMultiplier(value);
  if (isLocked && !fromLock) {
    applyPitch(value, { fromLock: true });
  }
};

const applyPitch = (value, { fromLock = false } = {}) => {
  pitchSlider.value = value;
  pitchValue.textContent = formatMultiplier(value);
  if (pitchShift) {
    const semitone = ratioToSemitone(value);
    pitchShift.pitch = semitone;
  }
  if (isLocked && !fromLock) {
    applySpeed(value, { fromLock: true });
  }
};

playBtn.addEventListener("click", async () => {
  if (!mediaElement) return;
  await Tone.start();
  if (mediaElement.paused) {
    await mediaElement.play();
    playBtn.textContent = "إيقاف";
    stopTicker();
    tick();
  } else {
    mediaElement.pause();
    playBtn.textContent = "تشغيل";
    stopTicker();
  }
});

speedSlider.addEventListener("input", (event) => {
  applySpeed(Number(event.target.value));
});

pitchSlider.addEventListener("input", (event) => {
  applyPitch(Number(event.target.value));
});

lockBtn.addEventListener("click", () => {
  isLocked = !isLocked;
  lockBtn.setAttribute("aria-pressed", String(isLocked));
  lockBtn.textContent = isLocked ? "🔒" : "🔓";
  lockBtn.title = isLocked ? "القيم متساوية" : "القيم منفصلة";
  if (isLocked) {
    const value = Number(speedSlider.value);
    applyPitch(value, { fromLock: true });
  }
});

const handleFiles = (files) => {
  const file = files?.[0];
  if (!file) return;
  setupMediaElement(file);
};

fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
});

const preventDefaults = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, preventDefaults, false);
});

dropzone.addEventListener("dragenter", () => {
  dropzone.classList.add("uploader__dropzone--dragging");
});

dropzone.addEventListener("dragleave", () => {
  dropzone.classList.remove("uploader__dropzone--dragging");
});

dropzone.addEventListener("drop", (event) => {
  dropzone.classList.remove("uploader__dropzone--dragging");
  handleFiles(event.dataTransfer.files);
});

dropzone.addEventListener("click", () => {
  fileInput.click();
});

applySpeed(1);
applyPitch(1);
