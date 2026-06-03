import { handleDownload } from "../../src/api.js";

export function onRequestGet({ request }) {
  return handleDownload(request);
}
