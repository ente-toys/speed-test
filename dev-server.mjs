import { createReadStream, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { onRequestGet as download } from "./functions/api/download.js";
import { onRequestPost as upload } from "./functions/api/upload.js";
import { onRequestGet as trace } from "./functions/api/trace.js";

const root = fileURLToPath(new URL("./public", import.meta.url));
const port = Number(process.env.PORT || 4173);

createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url || "/", `http://${incoming.headers.host}`);

  if (url.pathname === "/api/download" && incoming.method === "GET") {
    return sendWebResponse(outgoing, download({ request: toRequest(incoming, url) }));
  }

  if (url.pathname === "/api/upload" && incoming.method === "POST") {
    return sendWebResponse(outgoing, await upload({ request: toRequest(incoming, url) }));
  }

  if (url.pathname === "/api/trace" && incoming.method === "GET") {
    return sendWebResponse(outgoing, trace({ request: toRequest(incoming, url) }));
  }

  return serveStatic(url.pathname, outgoing);
}).listen(port, "127.0.0.1", () => {
  console.log(`Speed Test local server: http://127.0.0.1:${port}`);
});

function toRequest(incoming, url) {
  const init = {
    method: incoming.method,
    headers: incoming.headers,
  };

  if (incoming.method !== "GET" && incoming.method !== "HEAD") {
    init.body = incoming;
    init.duplex = "half";
  }

  return new Request(url, init);
}

async function sendWebResponse(outgoing, response) {
  outgoing.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) {
    outgoing.end();
    return;
  }

  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    outgoing.write(value);
  }
  outgoing.end();
}

async function serveStatic(pathname, outgoing) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(root, safePath);

  try {
    const stats = statSync(filePath);
    if (!stats.isFile()) throw new Error("Not a file");
    outgoing.writeHead(200, { "Content-Type": contentType(extname(filePath)) });
    createReadStream(filePath).pipe(outgoing);
  } catch {
    const fallback = await readFile(join(root, "index.html"));
    outgoing.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
    outgoing.end(fallback);
  }
}

function contentType(extension) {
  return (
    {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
    }[extension] || "application/octet-stream"
  );
}
