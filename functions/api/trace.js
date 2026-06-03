import { handleTrace } from "../../src/api.js";

export function onRequestGet({ request }) {
  return handleTrace(request);
}
