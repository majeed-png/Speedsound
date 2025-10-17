const fileInput = document.getElementById("file-input");
const dropzone = document.getElementById("dropzone");
const playerSection = document.getElementById("player");
const preview = document.getElementById("preview");
const playBtn = document.getElementById("play-btn");
const stopBtn = document.getElementById("stop-btn");
const exportBtn = document.getElementById("export-btn");
const timeLabel = document.getElementById("time-label");
const speedSlider = document.getElementById("speed-slider");
const pitchSlider = document.getElementById("pitch-slider");
const speedValue = document.getElementById("speed-value");
const pitchValue = document.getElementById("pitch-value");
const lockBtn = document.getElementById("lock-btn");
const exportStatus = document.getElementById("export-status");
const exportResult = document.getElementById("export-result");
const downloadLink = document.getElementById("download-link");

let mediaElement = null;
let mediaSourceNode = null;
let pitchShift = null;
let outputGain = null;
let recorderDestination = null;
let mediaRecorder = null;
let recordedChunks = [];
let exportUrl = null;
let currentObjectUrl = null;
let currentFileName = "output";
let rafId = null;
let isLocked = true;
let desiredSpeed = 1;
let desiredPitch = 1;

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

const ratioToSemitone = (ratio) => Math.log2(Math.max(ratio, 0.0001)) * 12;

const stopTicker = () => {
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
};

const updateTimeDisplay = () => {
  if (!mediaElement) {
    timeLabel.textContent = "00:00 / 00:00";
    return;
  }
  timeLabel.textContent = `${formatTime(mediaElement.currentTime)} / ${formatTime(
    mediaElement.duration
  )}`;
};

const tick = () => {
  updateTimeDisplay();
  if (mediaElement && !mediaElement.paused) {
    rafId = requestAnimationFrame(tick);
  }
};

const clearExportArtifacts = () => {
  exportStatus.hidden = true;
  exportResult.hidden = true;
  exportStatus.textContent = "";
  if (exportUrl) {
    URL.revokeObjectURL(exportUrl);
    exportUrl = null;
  }
};

const resetAudioGraph = () => {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
  }
  mediaRecorder = null;
  recordedChunks = [];
  if (mediaSourceNode) {
    mediaSourceNode.dispose();
    mediaSourceNode = null;
  }
  if (pitchShift) {
    pitchShift.dispose();
    pitchShift = null;
  }
  if (outputGain) {
    outputGain.dispose();
    outputGain = null;
  }
  recorderDestination = null;
};

const updatePitchShift = () => {
  if (!pitchShift) return;
  const ratio = desiredPitch / desiredSpeed;
  pitchShift.pitch = ratioToSemitone(ratio);
};

const connectAudioGraph = async (element) => {
  await Tone.start();
  resetAudioGraph();
  const context = Tone.getContext();
  mediaSourceNode = new Tone.MediaElementSource(element);
  pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.1 });
  outputGain = new Tone.Gain();
  recorderDestination = context.rawContext.createMediaStreamDestination();

  mediaSourceNode.connect(pitchShift);
  pitchShift.connect(outputGain);
  outputGain.connect(Tone.Destination);
  outputGain.connect(recorderDestination);

  element.muted = true;
};

const stopPlayback = ({ reset = false } = {}) => {
  if (!mediaElement) return;
  mediaElement.pause();
  if (reset) {
    mediaElement.currentTime = 0;
  }
  playBtn.textContent = "▶︎ تشغيل";
  playBtn.dataset.state = "idle";
  stopTicker();
  updateTimeDisplay();
};

const clearPreview = () => {
  stopTicker();
  preview.innerHTML = "";
  preview.classList.remove("player__preview--audio");
  playBtn.textContent = "▶︎ تشغيل";
  playBtn.disabled = true;
  stopBtn.disabled = true;
  exportBtn.disabled = true;
  playBtn.dataset.state = "idle";
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
  clearExportArtifacts();
};

const setupMediaElement = async (file) => {
  clearPreview();

  currentFileName = file.name?.replace(/\.[^.]+$/, "") || "output";
  const url = URL.createObjectURL(file);
  currentObjectUrl = url;
  const isVideo = file.type.startsWith("video");
  const element = document.createElement(isVideo ? "video" : "audio");
  element.src = url;
  element.controls = false;
  element.preload = "auto";
  element.crossOrigin = "anonymous";
  element.setAttribute("playsinline", "true");
  element.setAttribute("webkit-playsinline", "true");
  element.tabIndex = -1;
  element.loop = false;

  preview.classList.toggle("player__preview--audio", !isVideo);
  preview.appendChild(element);

  if (!isVideo) {
    const placeholder = document.createElement("div");
    placeholder.className = "player__placeholder";
    placeholder.innerHTML = `
      <div class="player__placeholder-inner">
        <span class="player__placeholder-icon">🔊</span>
        <span class="player__placeholder-text">${file.name || "ملف صوتي"}</span>
      </div>
    `;
    preview.appendChild(placeholder);
  }

  playerSection.hidden = false;
  mediaElement = element;

  element.addEventListener("loadedmetadata", () => {
    playBtn.disabled = false;
    stopBtn.disabled = false;
    exportBtn.disabled = false;
    updateTimeDisplay();
  });

  element.addEventListener("ended", () => {
    stopPlayback({ reset: true });
  });

  element.addEventListener("timeupdate", updateTimeDisplay);

  await connectAudioGraph(element);
  applySpeed(desiredSpeed, { fromLock: true });
  applyPitch(desiredPitch, { fromLock: true });
  updatePitchShift();
};

const applySpeed = (value, { fromLock = false } = {}) => {
  desiredSpeed = Number(value);
  if (mediaElement) {
    mediaElement.playbackRate = desiredSpeed;
  }
  speedSlider.value = desiredSpeed;
  speedValue.textContent = formatMultiplier(desiredSpeed);
  if (isLocked && !fromLock) {
    applyPitch(desiredSpeed, { fromLock: true });
    return;
  }
  updatePitchShift();
};

const applyPitch = (value, { fromLock = false } = {}) => {
  desiredPitch = Number(value);
  pitchSlider.value = desiredPitch;
  pitchValue.textContent = formatMultiplier(desiredPitch);
  if (isLocked && !fromLock) {
    applySpeed(desiredPitch, { fromLock: true });
    return;
  }
  updatePitchShift();
};

playBtn.addEventListener("click", async () => {
  if (!mediaElement) return;
  await Tone.start();
  if (mediaElement.paused) {
    await mediaElement.play();
    playBtn.textContent = "⏸︎ إيقاف مؤقت";
    playBtn.dataset.state = "playing";
    stopTicker();
    tick();
  } else {
    mediaElement.pause();
    playBtn.textContent = "▶︎ تشغيل";
    playBtn.dataset.state = "idle";
    stopTicker();
  }
});

stopBtn.addEventListener("click", () => {
  stopPlayback({ reset: true });
});

speedSlider.addEventListener("input", (event) => {
  applySpeed(event.target.value);
});

pitchSlider.addEventListener("input", (event) => {
  applyPitch(event.target.value);
});

speedSlider.addEventListener("dblclick", () => {
  applySpeed(1);
});

pitchSlider.addEventListener("dblclick", () => {
  applyPitch(1);
});

lockBtn.addEventListener("click", () => {
  isLocked = !isLocked;
  lockBtn.setAttribute("aria-pressed", String(isLocked));
  lockBtn.textContent = isLocked ? "🔒" : "🔓";
  lockBtn.title = isLocked ? "القيم متساوية" : "القيم منفصلة";
  if (isLocked) {
    const value = Number(speedSlider.value);
    applyPitch(value, { fromLock: true });
    applySpeed(value, { fromLock: true });
  }
});

const finishExport = () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
};

const startExport = async () => {
  if (!recorderDestination || !mediaElement) return;
  if (mediaRecorder && mediaRecorder.state === "recording") return;

  await Tone.start();
  clearExportArtifacts();
  recordedChunks = [];

  try {
    mediaRecorder = new MediaRecorder(recorderDestination.stream);
  } catch (error) {
    exportStatus.hidden = false;
    exportStatus.textContent = "تعذّر بدء التسجيل. جرّب متصفحًا يدعم MediaRecorder.";
    return;
  }

  exportStatus.hidden = false;
  exportStatus.textContent = "جارٍ التصدير...";
  playBtn.disabled = true;
  stopBtn.disabled = true;
  exportBtn.disabled = true;

  mediaRecorder.ondataavailable = (event) => {
    if (event.data && event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    if (!recordedChunks.length) {
      exportStatus.hidden = false;
      exportStatus.textContent = "لم يتم إنشاء أي بيانات صوتية.";
    } else {
      const blob = new Blob(recordedChunks, { type: "audio/webm" });
      exportUrl = URL.createObjectURL(blob);
      const downloadName = `${currentFileName || "output"}-remix.webm`;
      downloadLink.href = exportUrl;
      downloadLink.download = downloadName;
      downloadLink.textContent = "تحميل الملف المعدّل";
      exportStatus.hidden = true;
      exportResult.hidden = false;
      exportResult.textContent = "";
      exportResult.appendChild(downloadLink);
    }

    playBtn.disabled = false;
    stopBtn.disabled = false;
    exportBtn.disabled = false;
  };

  const handleExportEnd = () => {
    mediaElement.removeEventListener("ended", handleExportEnd);
    finishExport();
  };

  mediaElement.addEventListener("ended", handleExportEnd, { once: true });

  mediaRecorder.start();
  stopPlayback({ reset: true });
  mediaElement.currentTime = 0;
  mediaElement
    .play()
    .catch(() => {
      mediaElement.removeEventListener("ended", handleExportEnd);
      exportStatus.hidden = false;
      exportStatus.textContent = "تعذّر تشغيل الملف للتصدير.";
      finishExport();
      playBtn.disabled = false;
      stopBtn.disabled = false;
      exportBtn.disabled = false;
    });
};

exportBtn.addEventListener("click", () => {
  startExport();
});

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    if (exportUrl) {
      URL.revokeObjectURL(exportUrl);
    }
  });
}

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

dropzone.addEventListener("dragleave", (event) => {
  const next = event.relatedTarget;
  if (!next || !dropzone.contains(next)) {
    dropzone.classList.remove("uploader__dropzone--dragging");
  }
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
updatePitchShift();
