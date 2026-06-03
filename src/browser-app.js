import SpeedTest from "@cloudflare/speedtest";

const MEASUREMENTS = [
  { type: "latency", numPackets: 18 },
  { type: "download", bytes: 256_000, count: 1, bypassMinDuration: true },
  { type: "download", bytes: 1_000_000, count: 1 },
  { type: "download", bytes: 4_000_000, count: 1 },
  { type: "download", bytes: 12_000_000, count: 1 },
  { type: "download", bytes: 24_000_000, count: 1 },
  { type: "download", bytes: 48_000_000, count: 1 },
  { type: "upload", bytes: 256_000, count: 1, bypassMinDuration: true },
  { type: "upload", bytes: 1_000_000, count: 1 },
  { type: "upload", bytes: 4_000_000, count: 1 },
  { type: "upload", bytes: 12_000_000, count: 1 },
  { type: "upload", bytes: 24_000_000, count: 1 },
  { type: "upload", bytes: 48_000_000, count: 1 },
];

const STAGE_PROGRESS = {
  starting: { ceiling: 6 },
  latency: { ceiling: 22 },
  download: { ceiling: 62 },
  upload: { ceiling: 96 },
  finishing: { ceiling: 99 },
};

const EXPECTED_STAGE_MS = {
  starting: 900,
  latency: 2800,
  download: 9000,
  upload: 12000,
  finishing: 1600,
};

const elements = Object.fromEntries(
  [
    "domain-label",
    "run-button",
    "status-text",
    "progress-label",
    "progress-fill",
    "download-value",
    "upload-value",
    "latency-value",
    "jitter-value",
    "download-latency-value",
    "upload-latency-value",
  ].map((id) => [toKey(id), document.getElementById(id)]),
);

const state = {
  progress: 0,
  progressTimer: null,
  stage: "starting",
  stageStartProgress: 0,
  stageStartedAt: 0,
  test: null,
};

elements.domainLabel.textContent = window.location.hostname;
elements.runButton.addEventListener("click", runTest);

function runTest() {
  if (state.test?.isRunning) return;

  resetResults();
  elements.runButton.disabled = true;
  elements.runButton.textContent = "Running";

  const test = new SpeedTest({
    autoStart: false,
    downloadApiUrl: `${window.location.origin}/api/download`,
    uploadApiUrl: `${window.location.origin}/api/upload`,
    measurements: MEASUREMENTS,
    measureDownloadLoadedLatency: true,
    measureUploadLoadedLatency: true,
    loadedLatencyThrottle: 140,
    bandwidthFinishRequestDuration: 1200,
    bandwidthMinRequestDuration: 10,
    estimatedServerTime: 0,
  });

  state.test = test;

  test.onRunningChange = (running) => {
    if (!running && !test.isFinished) {
      stopProgressAnimation();
      elements.runButton.disabled = false;
      elements.runButton.textContent = "Retest";
    }
  };

  test.onResultsChange = ({ type }) => {
    setStage(stageFor(type), statusFor(type));
    renderResults(test.results);
  };

  test.onError = (error) => {
    stopProgressAnimation();
    updateProgress("Test failed. Please retry.", state.progress);
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
    console.error(error);
  };

  test.onFinish = (results) => {
    stopProgressAnimation();
    renderResults(results);
    updateProgress("Complete", 100);
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
  };

  updateProgress("Starting", 0);
  setStage("starting", "Starting");
  startProgressAnimation();
  test.play();
}

function renderResults(results) {
  elements.downloadValue.textContent = formatNumber(observedBandwidthMbps(results, "download"));
  elements.uploadValue.textContent = formatNumber(observedBandwidthMbps(results, "upload"));
  elements.latencyValue.textContent = formatNumber(results.getUnloadedLatency?.());
  elements.jitterValue.textContent = formatNumber(results.getUnloadedJitter?.());
  elements.downloadLatencyValue.textContent = formatNumber(results.getDownLoadedLatency?.());
  elements.uploadLatencyValue.textContent = formatNumber(results.getUpLoadedLatency?.());
}

function resetResults() {
  stopProgressAnimation();
  for (const key of [
    "downloadValue",
    "uploadValue",
    "latencyValue",
    "jitterValue",
    "downloadLatencyValue",
    "uploadLatencyValue",
  ]) {
    elements[key].textContent = "-";
  }
  updateProgress("Starting", 0);
}

function stageFor(type) {
  if (type === "latency") return "latency";
  if (type === "download") return "download";
  if (type === "upload") return "upload";
  return "finishing";
}

function statusFor(type) {
  if (type === "latency") return "Measuring latency";
  if (type === "download") return "Measuring download";
  if (type === "upload") return "Measuring upload";
  return "Running";
}

function setStage(stage, label) {
  if (stage !== state.stage) {
    state.stage = stage;
    state.stageStartProgress = state.progress;
    state.stageStartedAt = performance.now();
  }
  elements.statusText.textContent = label;
}

function startProgressAnimation() {
  stopProgressAnimation();
  state.stageStartedAt = performance.now();
  state.progressTimer = window.setInterval(advanceProgress, 120);
}

function stopProgressAnimation() {
  if (state.progressTimer) {
    window.clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
}

function advanceProgress() {
  const stage = STAGE_PROGRESS[state.stage] || STAGE_PROGRESS.finishing;
  const expectedMs = EXPECTED_STAGE_MS[state.stage] || EXPECTED_STAGE_MS.finishing;
  const elapsed = performance.now() - state.stageStartedAt;
  const ratio = 1 - Math.exp(-elapsed / expectedMs);
  const target = state.stageStartProgress + (stage.ceiling - state.stageStartProgress) * ratio;
  const next = Math.max(state.progress, Math.min(stage.ceiling, target));
  updateProgress(elements.statusText.textContent, Math.round(next));
}

function updateProgress(label, percent) {
  const bounded = Math.max(0, Math.min(100, percent));
  state.progress = bounded;
  elements.statusText.textContent = label;
  elements.progressLabel.textContent = `${bounded}%`;
  elements.progressFill.style.width = `${bounded}%`;
}

function bpsToMbps(value) {
  if (!Number.isFinite(value)) return null;
  return value / 1_000_000;
}

function observedBandwidthMbps(results, direction) {
  const finalBps =
    direction === "download" ? results.getDownloadBandwidth?.() : results.getUploadBandwidth?.();
  if (Number.isFinite(finalBps) && finalBps > 0) return bpsToMbps(finalBps);

  const points =
    direction === "download"
      ? results.getDownloadBandwidthPoints?.()
      : results.getUploadBandwidthPoints?.();
  const latestPositive = [...(points || [])].reverse().find((point) => point?.bps > 0);
  return bpsToMbps(latestPositive?.bps);
}

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(Math.min(digits, 1));
  return value.toFixed(digits);
}

function toKey(id) {
  return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
