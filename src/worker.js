import { handleDownload, handleTrace, handleUpload, methodNotAllowed } from "./api.js";

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/download") {
      return request.method === "GET" ? handleDownload(request) : methodNotAllowed();
    }

    if (url.pathname === "/api/upload") {
      return request.method === "POST" ? handleUpload(request) : methodNotAllowed();
    }

    if (url.pathname === "/api/trace") {
      return request.method === "GET" ? handleTrace(request) : methodNotAllowed();
    }

    return env.ASSETS.fetch(request);
  },
};
