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
let lastSliderChanged = "speed";
let dragCounter = 0;

const formatMultiplier = (value) => `${Number(value).toFixed(2)}×`;

const setSpeedValue = (value) => {
  const numeric = Number(value);
  desiredSpeed = numeric;
  speedSlider.value = numeric;
  speedValue.textContent = formatMultiplier(numeric);
  if (mediaElement) {
    mediaElement.playbackRate = numeric;
  }
};

const setPitchValue = (value) => {
  const numeric = Number(value);
  desiredPitch = numeric;
  pitchSlider.value = numeric;
  pitchValue.textContent = formatMultiplier(numeric);
};

const reflectLockState = () => {
  lockBtn.setAttribute("aria-pressed", String(isLocked));
  lockBtn.textContent = isLocked ? "🔒" : "🔓";
  lockBtn.title = isLocked ? "القيم متساوية" : "القيم منفصلة";
};

const ensureToneReady = async () => {
  await Tone.start();
  const context = Tone.getContext();
  if (context.rawContext?.state === "suspended") {
    try {
      await context.rawContext.resume();
    } catch (error) {
      console.warn("Failed to resume audio context", error);
    }
  }
};

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

const setLinkedValue = (value) => {
  setSpeedValue(value);
  setPitchValue(value);
  updatePitchShift();
};

const connectAudioGraph = async (element) => {
  await ensureToneReady();
  resetAudioGraph();
  const context = Tone.getContext();

  try {
    mediaSourceNode = new Tone.MediaElementSource(element);
    pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.1 });
    outputGain = new Tone.Gain();
    recorderDestination = context.rawContext.createMediaStreamDestination();

    mediaSourceNode.connect(pitchShift);
    pitchShift.connect(outputGain);
    outputGain.connect(Tone.Destination);
    outputGain.connect(recorderDestination);

    element.muted = true;
    element.volume = 0;
  } catch (error) {
    resetAudioGraph();
    element.muted = false;
    element.volume = 1;
    throw error;
  }
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
  pitchSlider.disabled = false;
  lockBtn.disabled = false;
  if (fileInput) {
    fileInput.value = "";
  }
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

  element.addEventListener(
    "loadedmetadata",
    async () => {
      try {
        await connectAudioGraph(element);
      } catch (error) {
        console.warn("Falling back to direct playback", error);
        exportStatus.hidden = false;
        exportStatus.textContent =
          "تعذّر تفعيل المعالجة المتقدمة. سيعمل التشغيل العادي دون تغيير الحِدّة.";
        pitchSlider.disabled = true;
        lockBtn.disabled = true;
      }

      const processingActive = Boolean(pitchShift);
      playBtn.disabled = false;
      stopBtn.disabled = false;
      exportBtn.disabled = !processingActive;
      pitchSlider.disabled = !processingActive;
      lockBtn.disabled = !processingActive;
      if (processingActive) {
        exportStatus.hidden = true;
      }
      updateTimeDisplay();

      handleSpeedInput(desiredSpeed, { fromLock: true });
      handlePitchInput(desiredPitch, { fromLock: true });
      updatePitchShift();
    },
    { once: true }
  );

  element.addEventListener("ended", () => {
    stopPlayback({ reset: true });
  });

  element.addEventListener("timeupdate", updateTimeDisplay);

};

const handleSpeedInput = (value, { fromLock = false } = {}) => {
  setSpeedValue(value);
  if (isLocked && !fromLock) {
    setPitchValue(value);
  }
  updatePitchShift();
};

const handlePitchInput = (value, { fromLock = false } = {}) => {
  setPitchValue(value);
  if (isLocked && !fromLock) {
    setSpeedValue(value);
  }
  updatePitchShift();
};

playBtn.addEventListener("click", async () => {
  if (!mediaElement) return;
  await ensureToneReady();
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
  lastSliderChanged = "speed";
  handleSpeedInput(event.target.value);
});

pitchSlider.addEventListener("input", (event) => {
  lastSliderChanged = "pitch";
  handlePitchInput(event.target.value);
});

speedSlider.addEventListener("dblclick", () => {
  lastSliderChanged = "speed";
  handleSpeedInput(1);
});

pitchSlider.addEventListener("dblclick", () => {
  lastSliderChanged = "pitch";
  handlePitchInput(1);
});

lockBtn.addEventListener("click", () => {
  isLocked = !isLocked;
  reflectLockState();
  if (isLocked) {
    const referenceValue =
      lastSliderChanged === "pitch" ? desiredPitch : desiredSpeed;
    setLinkedValue(referenceValue);
  }
});

const finishExport = () => {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
};

const startExport = async () => {
  if (!recorderDestination || !mediaElement) {
    exportStatus.hidden = false;
    exportStatus.textContent = "التصدير غير متاح حالياً لهذا الملف.";
    return;
  }
  if (mediaRecorder && mediaRecorder.state === "recording") return;

  await ensureToneReady();
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
  hideDragging();
  const file = files?.[0];
  if (!file) return;
  setupMediaElement(file);
};

if (fileInput) {
  fileInput.addEventListener("change", (event) => {
    handleFiles(event.target.files);
  });
}

const preventDefaults = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

const dropTargets = [dropzone, fileInput].filter(Boolean);

dropTargets.forEach((target) => {
  ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
    target.addEventListener(eventName, preventDefaults, false);
  });
});

const showDragging = () => {
  dropzone?.classList.add("uploader__dropzone--dragging");
};

const hideDragging = () => {
  dragCounter = 0;
  dropzone?.classList.remove("uploader__dropzone--dragging");
};

const handleDragEnter = () => {
  dragCounter += 1;
  showDragging();
};

const handleDragLeave = () => {
  dragCounter = Math.max(0, dragCounter - 1);
  if (dragCounter === 0) {
    dropzone?.classList.remove("uploader__dropzone--dragging");
  }
};

const handleDrop = (event) => {
  hideDragging();
  if (event.dataTransfer?.files?.length && !event._handled) {
    event._handled = true;
    handleFiles(event.dataTransfer.files);
  }
};

dropTargets.forEach((target) => {
  target.addEventListener("dragenter", handleDragEnter);
  target.addEventListener("dragleave", handleDragLeave);
  target.addEventListener("drop", handleDrop);
});

if (typeof window !== "undefined") {
  window.addEventListener("dragend", hideDragging);
  window.addEventListener("drop", hideDragging);
}

if (dropzone) {
  dropzone.addEventListener("click", (event) => {
    if (event.target === fileInput) return;
    fileInput?.click();
  });

  dropzone.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (fileInput) {
        fileInput.click();
      }
    }
  });
}

setLinkedValue(1);
reflectLockState();
