import type { FieldViolation, ProblemDetail } from "../types/api";

/**
 * The one place a failure from the archive becomes something the app can switch on (ADR-004).
 *
 * `fetch` reports three very different events through two channels: a 4xx or a 5xx **resolves** with
 * `response.ok === false`, while a refused connection, an unresolvable host and an abort all **reject**.
 * Neither channel carries the archive's `code`, which is the only stable thing the UI may branch on
 * (ADR-013). This module closes that gap: every failure leaves as an {@link ApiError} whose `kind`
 * says what happened and whose `code` is the archive's own vocabulary, or `undefined` when the request
 * never reached it.
 *
 * Nothing here renders. The client is plain TypeScript with no React import, so its mapping is tested
 * by calling it (`api/client.test.ts`).
 */

/** What went wrong, at the level the UI reacts to. */
export type ApiErrorKind =
  /** The archive answered, and the answer was a failure: 4xx or 5xx. `status` and `code` are set. */
  | "http"
  /** The request never reached the archive — connection refused, DNS failure, CORS. Usually "the API is not running". */
  | "network"
  /** The archive did not answer within the request's deadline. */
  | "timeout"
  /** The archive answered successfully with a body that is not the JSON it promised. A bug, not a state. */
  | "parse";

/**
 * Everything an {@link ApiError} carries besides its message. Absent means "unknown", never `null`.
 *
 * Each optional field admits an explicit `undefined`, which `exactOptionalPropertyTypes` otherwise
 * refuses: the failure being described may have a status and no `code`, and saying so with an
 * `undefined` is the honest way to pass it down from the mapper.
 */
interface ApiErrorDetails {
  /** The URL that was asked for, absolute or same-origin as it was built. */
  readonly url: string;
  /** The HTTP status, on an `"http"` error. */
  readonly status?: number | undefined;
  /** The archive's own code, when the failure carried one. */
  readonly code?: string | undefined;
  /** The parsed RFC 9457 body, when the failure had one in the right shape. */
  readonly problem?: ProblemDetail | undefined;
}

/**
 * A request that failed, classified.
 *
 * `message` exists for logs and for a developer reading a stack trace — it is **not** for the screen.
 * The UI reads `kind`, `status` and `code` and shows its own quiet sentence
 * (`.claude/rules/frontend.md`, "never a browser alert or raw stack").
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;

  /** HTTP status, or `undefined` when no response arrived. */
  readonly status: number | undefined;

  /** The archive's `code`, or `undefined` when the request never reached it. */
  readonly code: string | undefined;

  /** The RFC 9457 body as the archive wrote it, when there was one. */
  readonly problem: ProblemDetail | undefined;

  /** The URL that was requested. */
  readonly url: string;

  constructor(kind: ApiErrorKind, message: string, details: ApiErrorDetails) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = details.status;
    this.code = details.code;
    this.problem = details.problem;
    this.url = details.url;
  }
}

/** Options for one request. Everything has a default; nothing has to be passed. */
export interface ApiRequestOptions {
  readonly method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** A JSON string, a `FormData` for uploads, or nothing. */
  readonly body?: BodyInit;
  readonly headers?: Record<string, string>;
  /**
   * The caller's cancellation signal — TanStack Query passes one per query and aborts it when the
   * observer unmounts. A cancellation is **not** reported as an {@link ApiError}: the browser's own
   * abort reason is rethrown, which is what `fetch` callers (and the query retryer) expect.
   */
  readonly signal?: AbortSignal;
  /** Milliseconds before the request is abandoned. `0` disables the deadline. */
  readonly timeoutMs?: number;
}

/**
 * The deadline for one request. Ten seconds is generous for a LAN API whose slowest honest answer is
 * an upload ack; it exists to keep a wedged backend from leaving a view loading forever, not to
 * police speed. A caller with a longer job (an upload of a large photo) passes its own `timeoutMs`.
 */
export const DEFAULT_TIMEOUT_MS = 10_000;

/** The path every endpoint lives under. Mirrors `/api/v1` of `_docs/openapi.yml`. */
const API_PREFIX = "/api/v1";

/**
 * Turns a contract path into the URL to fetch.
 *
 * With no `VITE_API_BASE_URL` the base is **empty** and the path stays relative, so the request goes to
 * whatever origin served the app. That is the case in dev (`vite` proxies the API, see
 * `frontend/README.md`) and in the container (nginx serves the SPA and proxies `/api/**`), which is why
 * the default needs no environment-specific code. A set `VITE_API_BASE_URL` — an absolute origin,
 * **no `/api/v1` suffix** — wins and is used as-is, for a client pointed at an API elsewhere on the
 * LAN. `apiRequest` prepends `/api/v1` to the path *before* this join, so a base that also carries the
 * prefix doubles it — measured: `…/api/v1/api/v1/photos` answers 404 (E2-S2 probe, pinned by a test in
 * `api/client.test.ts`).
 *
 * Read per call rather than once at module load: a module-level constant would freeze the value before
 * a test could change it, and the cost is one `trim` per request.
 */
export function resolveApiUrl(path: string): string {
  const base = (import.meta.env.VITE_API_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}

/**
 * One request, one typed result.
 *
 * @param path a contract path — `/photos`, `/photos/random`, `/dumps`, … The `/api/v1` prefix is added
 *   here, so no caller repeats it.
 * @param options method, body, headers, cancellation signal and deadline.
 * @returns the parsed JSON body, typed by the caller as one of `src/types/api.ts`.
 * @throws {ApiError} every failure — HTTP, network, timeout or an unreadable body.
 * @throws the browser's own abort reason when the caller cancelled: cancellation is not a failure.
 */
export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const url = resolveApiUrl(`${API_PREFIX}${path.startsWith("/") ? path : `/${path}`}`);
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
  const signal = composeSignals(options.signal, deadline);

  const init: RequestInit = { method: options.method ?? "GET" };
  if (options.headers) {
    init.headers = options.headers;
  }
  if (options.body !== undefined) {
    init.body = options.body;
  }
  if (signal) {
    init.signal = signal;
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (error) {
    throw classifyTransportFailure(error, { url, caller: options.signal, deadline });
  }

  if (!response.ok) {
    const problem = await readProblem(response);
    throw new ApiError("http", describeFailure(response, problem), {
      url,
      status: response.status,
      code: problem?.code,
      problem,
    });
  }

  return readJson<T>(response, url);
}

/** Joins the caller's signal with the deadline, or returns whichever one exists. */
function composeSignals(
  caller: AbortSignal | undefined,
  deadline: AbortSignal | undefined,
): AbortSignal | undefined {
  if (caller && deadline) {
    return AbortSignal.any([caller, deadline]);
  }
  return caller ?? deadline;
}

/**
 * Classifies a rejected `fetch`. Measured, not assumed (`frontend/README.md`, "How a failure arrives"):
 * a refused connection and a failed DNS lookup are both `TypeError: fetch failed`, an expired deadline
 * is a `DOMException` named `TimeoutError`, and a cancellation is one named `AbortError`.
 *
 * The names are what is checked, not `instanceof DOMException`: in the test environment the error is
 * Node's `DOMException` while the global is jsdom's, so `instanceof` is false even for a real timeout.
 */
function classifyTransportFailure(
  error: unknown,
  context: { url: string; caller: AbortSignal | undefined; deadline: AbortSignal | undefined },
): unknown {
  // A cancelled request is not a failure: the caller asked for it to stop, and the query retryer and
  // `fetch` itself both expect the original abort to travel unchanged.
  if (context.caller?.aborted) {
    return error;
  }

  if (context.deadline?.aborted) {
    return new ApiError(
      "timeout",
      `No answer from the archive within the deadline (${context.url}).`,
      { url: context.url },
    );
  }

  const cause = error instanceof Error ? `: ${error.message}` : "";
  return new ApiError("network", `The archive could not be reached${cause}.`, { url: context.url });
}

/** A sentence for the log: the archive's own title, plus the status when there is no body to quote. */
function describeFailure(response: Response, problem: ProblemDetail | undefined): string {
  const title = problem?.title ?? response.statusText;
  return title ? `${title} (${response.status})` : `The archive answered ${response.status}.`;
}

/**
 * Reads a successful body. An empty body is not a failure — a `204 No Content` is a legitimate answer
 * to a request whose result the caller does not need — but a body that is neither empty nor JSON is:
 * the endpoint broke its own contract, and `SyntaxError` reaching a component would be a stack trace.
 * A read that dies mid-stream (a connection cut after the headers) is the same promise to the caller:
 * every failure leaves as an {@link ApiError}, never as the runtime's own `TypeError` (E2-S2 review).
 */
async function readJson<T>(response: Response, url: string): Promise<T> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    throw new ApiError("parse", `The archive's answer ended before it could be read (${url}).`, {
      url,
    });
  }
  if (text.trim() === "") {
    // `undefined` rather than a cast that pretends otherwise: the only callers that see this are the
    // ones that asked for `void`. Read as "the archive answered, and had nothing to say".
    return undefined as unknown as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError("parse", `The archive answered with a body that is not JSON (${url}).`, {
      url,
    });
  }
}

/**
 * The RFC 9457 body of a failed response, when there is one to read.
 *
 * Deliberately forgiving: a failure whose body cannot be parsed (an HTML error page from a proxy, a
 * connection cut mid-body) still fails as an `"http"` error carrying its `status`, because the status
 * is the actionable part and losing it to a `SyntaxError` would hide the real problem.
 */
async function readProblem(response: Response): Promise<ProblemDetail | undefined> {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    return undefined;
  }
  try {
    return toProblemDetail(await response.json());
  } catch {
    return undefined;
  }
}

/**
 * The body of a failed response as a {@link ProblemDetail}, or `undefined` when it is not one.
 *
 * Fields the contract mandates are required here (`title`, `status`); the optional ones are copied only
 * when they have the right type, so a problem that arrives without a `code` stays a problem rather than
 * becoming a crash.
 */
function toProblemDetail(value: unknown): ProblemDetail | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const { type, title, status, detail, instance, code, errors } = value;
  if (typeof title !== "string" || typeof status !== "number") {
    return undefined;
  }

  return {
    type: typeof type === "string" ? type : "about:blank",
    title,
    status,
    // The archive always writes a sentence; an empty one says "it sent none", never "the request was fine".
    detail: typeof detail === "string" ? detail : "",
    ...(typeof instance === "string" ? { instance } : {}),
    ...(typeof code === "string" ? { code } : {}),
    ...(Array.isArray(errors) ? { errors: errors.filter(isFieldViolation) } : {}),
  };
}

/** One entry of a validation problem's `errors`, if it has the shape `FieldViolation` declares. */
function isFieldViolation(value: unknown): value is FieldViolation {
  return isRecord(value) && typeof value.field === "string" && typeof value.message === "string";
}

/** A JSON object, as opposed to an array, a string or `null`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
