import SpeedTest from "@cloudflare/speedtest";
import { toPng } from "html-to-image";

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

const EXPORT_PADDING_PX = 24;

const elements = Object.fromEntries(
  [
    "domain-label",
    "network-chip",
    "network-label",
    "result-capture",
    "actions",
    "run-button",
    "share-button",
    "status-text",
    "status-panel",
    "status-icon",
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
elements.shareButton.addEventListener("click", shareResult);

function runTest() {
  if (state.test?.isRunning) return;

  resetResults();
  elements.actions.classList.remove("is-complete");
  loadTrace();
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
      elements.shareButton.hidden = true;
      elements.actions.classList.remove("is-complete");
    }
  };

  test.onResultsChange = ({ type }) => {
    setStage(stageFor(type), statusFor(type));
    renderResults(test.results);
  };

  test.onError = (error) => {
    stopProgressAnimation();
    elements.statusPanel.classList.remove("is-complete");
    updateProgress("Test failed. Please retry.", state.progress);
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
    elements.shareButton.hidden = true;
    elements.actions.classList.remove("is-complete");
    console.error(error);
  };

  test.onFinish = (results) => {
    stopProgressAnimation();
    renderResults(results);
    finishProgress();
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

async function loadTrace() {
  try {
    const traceUrl = new URL("/api/trace", window.location.origin);
    traceUrl.searchParams.set("t", Date.now().toString());
    const response = await fetch(traceUrl, { cache: "no-store" });
    if (!response.ok) throw new Error(`Trace failed: ${response.status}`);
    setNetworkLabel(formatNetwork(await response.json()));
  } catch (error) {
    setNetworkLabel("");
    console.error(error);
  }
}

function setNetworkLabel(label) {
  elements.networkLabel.textContent = label;
  elements.networkChip.hidden = !label;
}

function resetResults() {
  stopProgressAnimation();
  elements.statusPanel.classList.remove("is-complete");
  elements.shareButton.hidden = true;
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

function finishProgress() {
  setStage("finishing", "Finishing");
  animateToProgress(99, 900, () => {
    updateProgress("Complete", 100);
    elements.statusPanel.classList.add("is-complete");
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
    elements.shareButton.hidden = false;
    elements.actions.classList.add("is-complete");
  });
}

async function shareResult() {
  const originalText = elements.shareButton.textContent;
  elements.shareButton.disabled = true;
  elements.shareButton.textContent = "Preparing";

  try {
    const rect = elements.resultCapture.getBoundingClientRect();
    const backgroundColor = getComputedStyle(document.body).backgroundColor;
    const dataUrl = await toPng(elements.resultCapture, {
      backgroundColor,
      cacheBust: true,
      filter: (node) => !node.classList?.contains("capture-exclude"),
      height: Math.ceil(rect.height) + EXPORT_PADDING_PX * 2,
      pixelRatio: Math.min(2, window.devicePixelRatio || 1),
      style: {
        backgroundColor,
        boxSizing: "content-box",
        padding: `${EXPORT_PADDING_PX}px`,
        width: `${Math.ceil(rect.width)}px`,
      },
      width: Math.ceil(rect.width) + EXPORT_PADDING_PX * 2,
    });

    const link = document.createElement("a");
    link.download = `speed-test-${safeFilePart(window.location.hostname)}.png`;
    link.href = dataUrl;
    link.click();
  } catch (error) {
    console.error(error);
    updateProgress("Could not export result.", state.progress);
  } finally {
    elements.shareButton.disabled = false;
    elements.shareButton.textContent = originalText;
  }
}

function animateToProgress(target, durationMs, onDone) {
  const start = state.progress;
  const startedAt = performance.now();

  const tick = () => {
    const elapsed = performance.now() - startedAt;
    const ratio = Math.min(1, elapsed / durationMs);
    const eased = 1 - (1 - ratio) ** 3;
    const next = start + (target - start) * eased;
    updateProgress(elements.statusText.textContent, Math.round(next));

    if (ratio < 1) {
      window.requestAnimationFrame(tick);
    } else {
      onDone?.();
    }
  };

  window.requestAnimationFrame(tick);
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

function formatNetwork(trace) {
  const organization = normalizeText(trace?.asOrganization);
  const asnValue = Number(trace?.asn);
  const asn = Number.isFinite(asnValue) && asnValue > 0 ? `ASN ${asnValue}` : "";
  return asn || organization;
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function toKey(id) {
  return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function safeFilePart(value) {
  return (value || "result").replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "");
}
