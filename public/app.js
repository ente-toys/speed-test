import { formatNumber, jitterMs, mbps, percentile } from "./metrics.js";

const TRANSFER_SIZES = [256_000, 1_000_000, 4_000_000, 12_000_000, 24_000_000, 48_000_000];
const DOWNLOAD_WARMUP_BYTES = 128_000;
const UPLOAD_WARMUP_BYTES = 64_000;
const LATENCY_SAMPLES = 18;
const MIN_TRANSFER_SAMPLES = 4;
const TARGET_TRANSFER_MS = 1200;
const MAX_DIRECTION_BYTES = 90_000_000;
const LOADED_PROBE_DELAY_MS = 140;

const state = { running: false };

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

elements.domainLabel.textContent = window.location.hostname;
elements.runButton.addEventListener("click", runTest);

async function runTest() {
  if (state.running) return;
  state.running = true;
  elements.runButton.disabled = true;
  elements.runButton.textContent = "Running";
  resetResults();

  const results = {
    latency: [],
    downloadMbps: [],
    uploadMbps: [],
    downloadLoadedLatency: [],
    uploadLoadedLatency: [],
  };

  try {
    updateProgress("Measuring latency", 8);
    await measureLatency(results, LATENCY_SAMPLES);
    renderPartial(results);

    updateProgress("Warming up download", 22);
    await warmupDownload();
    updateProgress("Measuring download", 28);
    let downloading = true;
    const downloadProbe = probeLoadedLatency(results, "downloadLoadedLatency", () => downloading);
    try {
      await measureDownload(results);
    } finally {
      downloading = false;
    }
    await downloadProbe;
    renderPartial(results);

    updateProgress("Warming up upload", 60);
    await warmupUpload();
    updateProgress("Measuring upload", 64);
    let uploading = true;
    const uploadProbe = probeLoadedLatency(results, "uploadLoadedLatency", () => uploading);
    try {
      await measureUpload(results);
    } finally {
      uploading = false;
    }
    await uploadProbe;
    renderFinal(results);
  } catch (error) {
    elements.statusText.textContent = "Test failed. Please retry.";
    console.error(error);
  } finally {
    state.running = false;
    elements.runButton.disabled = false;
    elements.runButton.textContent = "Retest";
  }
}

async function measureLatency(results, count, bucket = "latency") {
  for (let index = 0; index < count; index += 1) {
    const started = performance.now();
    const response = await fetch(`/__down?bytes=0&nonce=${crypto.randomUUID()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Latency failed: ${response.status}`);
    results[bucket].push(performance.now() - started);
  }
}

async function measureDownload(results) {
  let totalBytes = 0;
  for (const [index, bytes] of TRANSFER_SIZES.entries()) {
    const started = performance.now();
    const response = await fetch(`/__down?bytes=${bytes}&nonce=${crypto.randomUUID()}`, {
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`Download failed: ${response.status}`);
    const body = await response.arrayBuffer();
    const duration = performance.now() - started;
    totalBytes += body.byteLength;
    results.downloadMbps.push(mbps(body.byteLength, duration));
    updateProgress("Measuring download", 28 + Math.round(((index + 1) / TRANSFER_SIZES.length) * 28));

    if (
      results.downloadMbps.length >= MIN_TRANSFER_SAMPLES &&
      (duration >= TARGET_TRANSFER_MS || totalBytes >= MAX_DIRECTION_BYTES)
    ) {
      break;
    }
  }
}

async function measureUpload(results) {
  let totalBytes = 0;
  for (const [index, bytes] of TRANSFER_SIZES.entries()) {
    const payload = payloadFor(bytes);
    const started = performance.now();
    const response = await fetch(`/__up?nonce=${crypto.randomUUID()}`, {
      method: "POST",
      body: payload,
      cache: "no-store",
      headers: {
        "Content-Type": "application/octet-stream",
      },
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    const duration = performance.now() - started;
    totalBytes += bytes;
    results.uploadMbps.push(mbps(bytes, duration));
    updateProgress("Measuring upload", 64 + Math.round(((index + 1) / TRANSFER_SIZES.length) * 30));

    if (
      results.uploadMbps.length >= MIN_TRANSFER_SAMPLES &&
      (duration >= TARGET_TRANSFER_MS || totalBytes >= MAX_DIRECTION_BYTES)
    ) {
      break;
    }
  }
}

async function warmupDownload() {
  const response = await fetch(`/__down?bytes=${DOWNLOAD_WARMUP_BYTES}&nonce=${crypto.randomUUID()}`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Download warm-up failed: ${response.status}`);
  await response.arrayBuffer();
}

async function warmupUpload() {
  const response = await fetch(`/__up?nonce=${crypto.randomUUID()}`, {
    method: "POST",
    body: payloadFor(UPLOAD_WARMUP_BYTES),
    cache: "no-store",
    headers: {
      "Content-Type": "application/octet-stream",
    },
  });
  if (!response.ok) throw new Error(`Upload warm-up failed: ${response.status}`);
}

async function probeLoadedLatency(results, bucket, isActive) {
  while (isActive()) {
    await measureLatency(results, 1, bucket);
    await delay(LOADED_PROBE_DELAY_MS);
  }
}

const payloadCache = new Map();

function payloadFor(size) {
  if (!payloadCache.has(size)) {
    payloadCache.set(size, patternedBytes(size));
  }
  return payloadCache.get(size);
}

function patternedBytes(size) {
  const bytes = new Uint8Array(size);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = index & 255;
  }
  return bytes;
}

function renderPartial(results) {
  elements.latencyValue.textContent = formatNumber(percentile(results.latency, 50));
  elements.jitterValue.textContent = formatNumber(jitterMs(results.latency));
}

function renderFinal(results) {
  updateProgress("Complete", 100);
  elements.downloadValue.textContent = formatNumber(percentile(results.downloadMbps, 90));
  elements.uploadValue.textContent = formatNumber(percentile(results.uploadMbps, 90));
  elements.latencyValue.textContent = formatNumber(percentile(results.latency, 50));
  elements.jitterValue.textContent = formatNumber(jitterMs(results.latency));
  elements.downloadLatencyValue.textContent = formatNumber(percentile(results.downloadLoadedLatency, 95));
  elements.uploadLatencyValue.textContent = formatNumber(percentile(results.uploadLoadedLatency, 95));
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

function updateProgress(label, percent) {
  const bounded = Math.max(0, Math.min(100, percent));
  elements.statusText.textContent = label;
  elements.progressLabel.textContent = `${bounded}%`;
  elements.progressFill.style.width = `${bounded}%`;
}

function delay(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function toKey(id) {
  return id.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
