/**
 * A W3C trace context for one publish request.
 *
 * The backend's Micrometer tracing accepts `traceparent`, so a browser-generated id makes the trace
 * start at the click instead of at the controller. That is what lets a reader copy the `traceId` from
 * a JSON log line and find the same trace in Jaeger (ADR-029).
 *
 * The format is fixed by the W3C Trace Context recommendation:
 * `version-trace-id-parent-id-flags`, all lowercase hex, version `00`, flags `01` (sampled).
 */
const TRACE_ID_BYTES = 16;
const SPAN_ID_BYTES = 8;

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  if (globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
  }
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Math.floor(Math.random() * 256);
  }
  return bytes;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A new sampled trace context, safe to send as the `traceparent` header. */
export function createTraceparent(): string {
  const traceId = hex(randomBytes(TRACE_ID_BYTES));
  const parentId = hex(randomBytes(SPAN_ID_BYTES));
  return `00-${traceId}-${parentId}-01`;
}
