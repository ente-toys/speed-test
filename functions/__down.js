const MAX_BYTES = 100_000_000;
const CHUNK_SIZE = 64 * 1024;

export function onRequestGet({ request }) {
  const url = new URL(request.url);
  const bytes = Number(url.searchParams.get("bytes") || "0");

  if (!Number.isInteger(bytes) || bytes < 0 || bytes > MAX_BYTES) {
    return new Response("Invalid byte count", { status: 400, headers: noCacheHeaders() });
  }

  return new Response(byteStream(bytes), {
    headers: {
      ...noCacheHeaders(),
      "Content-Type": "application/octet-stream",
      "Content-Length": String(bytes),
    },
  });
}

function byteStream(totalBytes) {
  let remaining = totalBytes;
  let seed = 0x9e3779b9;

  return new ReadableStream({
    pull(controller) {
      if (remaining <= 0) {
        controller.close();
        return;
      }

      const size = Math.min(CHUNK_SIZE, remaining);
      const chunk = new Uint8Array(size);
      for (let index = 0; index < size; index += 1) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        chunk[index] = seed & 255;
      }

      remaining -= size;
      controller.enqueue(chunk);
    },
  });
}

function noCacheHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
  };
}

