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
      elements.runButton.disabled = false;
      elements.runButton.textContent = "Retest";
    }
  };

  test.onResultsChange = ({ type }) => {
    updateProgress(statusFor(type), Math.min(94, state.progress + progressStep(type)));
    renderResults(test.results);
  };

  test.onError = (error) => {
    updateProgress("Test failed. Please retry.", state.progress);
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
    console.error(error);
  };

  test.onFinish = (results) => {
    renderResults(results);
    updateProgress("Complete", 100);
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
  };

  updateProgress("Starting", 0);
  test.play();
}

function renderResults(results) {
  elements.downloadValue.textContent = formatNumber(bpsToMbps(results.getDownloadBandwidth?.()));
  elements.uploadValue.textContent = formatNumber(bpsToMbps(results.getUploadBandwidth?.()));
  elements.latencyValue.textContent = formatNumber(results.getUnloadedLatency?.());
  elements.jitterValue.textContent = formatNumber(results.getUnloadedJitter?.());
  elements.downloadLatencyValue.textContent = formatNumber(results.getDownLoadedLatency?.());
  elements.uploadLatencyValue.textContent = formatNumber(results.getUpLoadedLatency?.());
}

function resetResults() {
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

function statusFor(type) {
  if (type === "latency") return "Measuring latency";
  if (type === "download") return "Measuring download";
  if (type === "upload") return "Measuring upload";
  return "Running";
}

function progressStep(type) {
  if (type === "latency") return 8;
  if (type === "download") return 10;
  if (type === "upload") return 10;
  return 4;
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

function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(Math.min(digits, 1));
  return value.toFixed(digits);
}

function toKey(id) {
  return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
