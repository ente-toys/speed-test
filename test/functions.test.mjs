import assert from "node:assert/strict";
import test from "node:test";
import { onRequestGet as download } from "../functions/api/download.js";
import { onRequestPost as upload } from "../functions/api/upload.js";
import { onRequestGet as trace } from "../functions/api/trace.js";

test("download endpoint returns the requested byte count", async () => {
  const response = download({
    request: new Request("https://speed.test/api/download?bytes=12345"),
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Length"), "12345");
  assert.match(response.headers.get("Cache-Control"), /no-store/);

  const body = await response.arrayBuffer();
  assert.equal(body.byteLength, 12345);
});

test("download endpoint rejects invalid byte counts", () => {
  const response = download({
    request: new Request("https://speed.test/api/download?bytes=-1"),
  });
  assert.equal(response.status, 400);
});

test("upload endpoint drains and discards the body", async () => {
  const response = await upload({
    request: new Request("https://speed.test/api/upload", {
      method: "POST",
      body: new Uint8Array(128),
      headers: { "Content-Type": "application/octet-stream" },
    }),
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.deepEqual(await response.json(), { ok: true, bytesReceived: 128 });
});

test("trace endpoint returns safe request metadata", async () => {
  const response = trace({
    request: new Request("https://speed.test/api/trace", {
      headers: { "user-agent": "Example Browser" },
    }),
  });
  const body = await response.json();
  assert.equal(body.hostname, "speed.test");
  assert.equal(body.userAgent, "Example Browser");
  assert.ok(body.timestamp);
});
