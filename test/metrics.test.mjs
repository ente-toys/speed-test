import assert from "node:assert/strict";
import test from "node:test";
import {
  average,
  formatNumber,
  jitterMs,
  mbps,
  percentile,
} from "../public/metrics.js";

test("calculates percentile from sorted numeric values", () => {
  assert.equal(percentile([50, 10, 40, 20, 30], 50), 30);
  assert.equal(percentile([50, 10, 40, 20, 30], 90), 50);
  assert.equal(percentile([], 50), null);
});

test("calculates average jitter from adjacent latency deltas", () => {
  assert.equal(average([10, 20, 40]), 70 / 3);
  assert.equal(jitterMs([10, 18, 13]), 6.5);
  assert.equal(jitterMs([10]), null);
});

test("converts byte transfers to Mbps", () => {
  assert.equal(mbps(1_000_000, 1000), 8);
  assert.equal(mbps(1_000_000, 0), null);
});

test("formats metric values compactly", () => {
  assert.equal(formatNumber(123.4), "123");
  assert.equal(formatNumber(12.34), "12.3");
  assert.equal(formatNumber(1.234), "1.2");
});
