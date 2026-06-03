import assert from "node:assert/strict";
import test from "node:test";
import { handleDownload, handleTrace, handleUpload } from "../src/api.js";
import worker from "../src/worker.js";

test("download endpoint returns the requested byte count", async () => {
  const response = handleDownload(new Request("https://speed.test/api/download?bytes=12345"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Length"), "12345");
  assert.match(response.headers.get("Cache-Control"), /no-store/);

  const body = await response.arrayBuffer();
  assert.equal(body.byteLength, 12345);
});

test("download endpoint rejects invalid byte counts", () => {
  const response = handleDownload(new Request("https://speed.test/api/download?bytes=-1"));
  assert.equal(response.status, 400);
});

test("upload endpoint drains and discards the body", async () => {
  const response = await handleUpload(
    new Request("https://speed.test/api/upload", {
      method: "POST",
      body: new Uint8Array(128),
      headers: { "Content-Type": "application/octet-stream" },
    }),
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("Cache-Control"), /no-store/);
  assert.deepEqual(await response.json(), { ok: true, bytesReceived: 128 });
});

test("trace endpoint returns safe request metadata", async () => {
  const response = handleTrace(
    new Request("https://speed.test/api/trace", {
      headers: { "user-agent": "Example Browser" },
    }),
  );
  const body = await response.json();
  assert.equal(body.hostname, "speed.test");
  assert.equal(body.userAgent, "Example Browser");
  assert.ok(body.timestamp);
});

test("worker routes api requests before static assets", async () => {
  const response = await worker.fetch(
    new Request("https://speed.test/api/download?bytes=9"),
    { ASSETS: { fetch: () => new Response("asset", { status: 404 }) } },
  );
  assert.equal(response.status, 200);
  assert.equal((await response.arrayBuffer()).byteLength, 9);
});
