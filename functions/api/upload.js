const MAX_BYTES = 100_000_000;

export async function onRequestPost({ request }) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (!Number.isFinite(contentLength) || contentLength > MAX_BYTES) {
    return new Response("Upload too large", { status: 413, headers: noCacheHeaders() });
  }

  let bytesReceived = 0;
  if (request.body) {
    const reader = request.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesReceived += value.byteLength;
      if (bytesReceived > MAX_BYTES) {
        return new Response("Upload too large", { status: 413, headers: noCacheHeaders() });
      }
    }
  }

  return Response.json(
    { ok: true, bytesReceived },
    { headers: noCacheHeaders() },
  );
}

export function onRequest() {
  return new Response("Method not allowed", { status: 405, headers: noCacheHeaders() });
}

function noCacheHeaders() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
  };
}

