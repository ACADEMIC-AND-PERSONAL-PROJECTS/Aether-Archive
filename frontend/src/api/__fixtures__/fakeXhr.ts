/**
 * A faithful-enough `XMLHttpRequest` for the upload tests (E4-S1).
 *
 * jsdom implements the interface but not a server, so the transport would reject at the network boundary
 * and prove nothing about progress, abort or the problem-body mapping. This fake keeps the contract the
 * transport actually uses — the upload's `progress` handler, the four completion handlers, `open`,
 * `send`, `abort`, `timeout`, `status` and `getResponseHeader` — and lets a test drive each of them.
 *
 * It is a hand-written stub rather than a general-purpose mock: every method below exists because the
 * shipped code calls it, and `send` records whether the progress listener was already attached, which is
 * the ordering MDN warns about.
 */

type VoidHandler = (() => void) | null;

export class FakeXhr {
  /** Every instance the transport created, in order. Reset in `beforeEach`. */
  static instances: FakeXhr[] = [];

  static reset(): void {
    FakeXhr.instances = [];
  }

  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };

  onload: VoidHandler = null;
  onerror: VoidHandler = null;
  ontimeout: VoidHandler = null;
  onabort: VoidHandler = null;

  timeout = 0;
  method = "";
  url = "";
  body: BodyInit | null = null;
  status = 0;
  statusText = "";
  responseText = "";
  progressAttachedBeforeSend: boolean | null = null;
  aborted = false;

  private responseHeaders: Record<string, string> = {};

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(method: string, url: string): void {
    this.method = method;
    this.url = url;
  }

  send(body: BodyInit | null = null): void {
    this.body = body;
    this.progressAttachedBeforeSend = this.upload.onprogress !== null;
  }

  abort(): void {
    this.aborted = true;
    this.onabort?.();
  }

  getResponseHeader(name: string): string | null {
    return this.responseHeaders[name.toLowerCase()] ?? null;
  }

  /** One `upload.onprogress` event; `total: 0` stands for `lengthComputable === false`. */
  emitProgress(loaded: number, total: number): void {
    this.upload.onprogress?.({
      loaded,
      total,
      lengthComputable: total > 0,
    } as unknown as ProgressEvent);
  }

  /** The archive answered: status, body (object → JSON text) and content type. */
  respond(status: number, body: unknown, contentType = "application/json"): void {
    this.status = status;
    this.statusText = status >= 200 && status < 300 ? "OK" : "";
    this.responseText = typeof body === "string" ? body : JSON.stringify(body);
    this.responseHeaders["content-type"] = contentType;
    this.onload?.();
  }

  failNetwork(): void {
    this.onerror?.();
  }

  expire(): void {
    this.ontimeout?.();
  }
}

/** The single request a test expects to have been opened. */
export function onlyRequest(): FakeXhr {
  const request = FakeXhr.instances[0];
  if (request === undefined) {
    throw new Error("the transport opened no request");
  }
  return request;
}
