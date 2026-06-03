export function percentile(values, p) {
  const clean = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (clean.length === 0) return null;
  const index = Math.min(clean.length - 1, Math.max(0, Math.ceil((p / 100) * clean.length) - 1));
  return clean[index];
}

export function average(values) {
  const clean = values.filter((value) => Number.isFinite(value));
  if (clean.length === 0) return null;
  return clean.reduce((sum, value) => sum + value, 0) / clean.length;
}

export function jitterMs(latencies) {
  const clean = latencies.filter((value) => Number.isFinite(value));
  if (clean.length < 2) return null;
  const deltas = [];
  for (let index = 1; index < clean.length; index += 1) {
    deltas.push(Math.abs(clean[index] - clean[index - 1]));
  }
  return average(deltas);
}

export function mbps(bytes, durationMs) {
  if (!Number.isFinite(bytes) || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  return (bytes * 8) / (durationMs / 1000) / 1_000_000;
}

export function formatNumber(value, digits = 1) {
  if (!Number.isFinite(value)) return "-";
  if (value >= 100) return Math.round(value).toString();
  if (value >= 10) return value.toFixed(Math.min(digits, 1));
  return value.toFixed(digits);
}
