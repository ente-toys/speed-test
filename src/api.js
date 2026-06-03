const MAX_BYTES = 100_000_000;
const CHUNK_SIZE = 64 * 1024;

export function handleDownload(request) {
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

export async function handleUpload(request) {
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

  return Response.json({ ok: true, bytesReceived }, { headers: noCacheHeaders() });
}

export function handleTrace(request) {
  const url = new URL(request.url);
  const cf = request.cf || {};
  const userAgent = request.headers.get("user-agent") || "";

  return Response.json(
    {
      hostname: url.hostname,
      timestamp: new Date().toISOString(),
      colo: cf.colo || null,
      country: cf.country || null,
      region: cf.region || cf.regionCode || null,
      city: cf.city || null,
      asn: cf.asn || null,
      asOrganization: cf.asOrganization || null,
      httpProtocol: cf.httpProtocol || null,
      tlsVersion: cf.tlsVersion || null,
      userAgent: userAgent.slice(0, 240),
    },
    { headers: noCacheHeaders() },
  );
}

export function methodNotAllowed() {
  return new Response("Method not allowed", { status: 405, headers: noCacheHeaders() });
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
