import { handleUpload, methodNotAllowed } from "../../src/api.js";

export async function onRequestPost({ request }) {
  return handleUpload(request);
}

export function onRequest() {
  return methodNotAllowed();
}
