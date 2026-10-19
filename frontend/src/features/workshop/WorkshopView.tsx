import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { useNavigate } from "react-router";

import { QUIET_ACTION } from "./actions";
import { AuraPicker } from "./AuraPicker";
import { SelectionGrid, type SelectionItem } from "./SelectionGrid";
import { ApiError } from "../../api/client";
import { usePublishDump } from "../../api/dumps";
import { useUploadPhoto } from "../../api/photos";
import { GlassPanel } from "../../components/GlassPanel";
import { useAura } from "../../hooks/useAura";
import { ENTER_FADE_BASE, LOADING_PULSE } from "../../lib/motion/tokens";
import { moveItem } from "../../lib/ordering/move";
import { DUMP_PHOTO_COUNT, planPublish } from "../../lib/publish/plan";
import { publishErrorSentence } from "../../lib/publish/sentence";
import { downscaleForUpload } from "../../lib/upload/downscale";
import { isCurrentProgress } from "../../lib/upload/progress";
import {
  planSelection,
  queueSummary,
  selectionNotices,
  selectionSentence,
} from "../../lib/upload/selection";
import { ACCEPT_ATTRIBUTE } from "../../lib/upload/validation";

import type { UploadProgress } from "../../api/uploadPhoto";

/**
 * `GET /curate` — the Curator's Workshop: multi-select and the upload queue (E4-S2A2), the draft that
 * survives its upload (E4-S5A), and the publish that saves it (E4-S5D).
 *
 * ## The screen
 *
 * With nothing picked, the view is one display-serif sentence and one quiet action. Once photos are
 * picked, the photos are the screen: a grid of square thumbnails and one glass editing surface. The
 * grid is the focal point; the panel is the only chrome, and everything in it is `--aura-text` because
 * it sits on glass (DESIGN-SYSTEM §2.2, the E3-S2 measurement). The controls stack below the images on
 * a phone and sit alongside them on desktop. Each tile carries its own scrim, so a remove control and
 * a failed preview always have a known backdrop. There is no spinner and no per-tile progress: the only
 * progress signal is E4-S1B's one 2 px line, which always describes the request actually in flight.
 *
 * ## The cap
 *
 * At most six photos can be selected at once — a dump is six, so six is the most a queue can be building
 * toward. The cap counts the tiles already in the grid plus the picked files; a valid file past it is
 * ignored and the screen says how many in one quiet sentence ("You can add up to 6 photos at a time — 1
 * wasn't added."). A file the client refuses (empty, wrong declared type, too large) is reported **per
 * file**, by name, and does not consume a slot — it was never eligible. The rules and the wording live in
 * `lib/upload/selection.ts`, unit-tested without React; `validateUpload` is still an **experience
 * measure, not a boundary**: the server sniffs the bytes and enforces the ceiling.
 *
 * ## The queue
 *
 * One action uploads every waiting or failed tile **in selection order, one request at a time**. The
 * concurrency is one on purpose: the progress line describes the request actually in flight, the server
 * sees a phone's uplink the way it would see a single upload, and a failure has an unambiguous owner —
 * the tile that was uploading. A failure marks its tile `error` with the quiet sentence and the queue
 * continues; it never aborts the files behind it. Failed files stay in the grid, and "Try again" resends
 * the **same `File` objects** (identity asserted in the tests) — nothing is re-read from the input, so a
 * failure cannot lose the selection.
 *
 * Invalidation is the API layer's and stays on `onSuccess` (`api/photos.ts`): each successful file marks
 * `queryKeys.photos` stale by prefix, which covers the splash hero. A failure and a cancellation never
 * invalidate. Because the hook fires the invalidation without returning its promise, the queue is never
 * gated on a refetch.
 *
 * ## Downscaling before upload
 *
 * Before a file's request opens, the queue asks `downscaleForUpload` for the bytes it should send
 * (E4-S2B). The returned `File` is kept on the item as `uploadFile`, so "Try again" resends **that same
 * object** rather than encoding twice — identity, like E4-S2A2's retry promise. The progress total is the
 * size of the file actually sent, and the tile preview stays the original object URL: the user keeps
 * seeing their photo, not a re-encode of it. `downscaleForUpload` resolves to the original on every
 * failure; the queue catches a rejection too, because a downscale must never block an upload.
 *
 * ## Settling, and cancelling the batch
 *
 * When the queue settles, the panel says what this batch did — "Added 3 photos.", "2 photos couldn't be
 * added.", or both halves when both happened. A success keeps its tile (E4-S5A): it is marked `added`
 * and carries the archive's photo, and the view stays `selected` — the grid is the draft the publish
 * will read. It stays `error` while any failed tile remains.
 *
 * Cancel is the **batch's** cancel: it aborts the request in flight and stops the queue. The files
 * already uploaded keep their tiles as `added` — their photos are in the archive — the files not yet
 * sent stay in the grid as waiting, and the current file returns to waiting (it was not stored as far
 * as this client knows). The panel says "Upload cancelled." visibly.
 *
 * **Cancellation is not a rollback**, and the E4-S1B caveat stands: an abort can race a response that
 * already reached `StorageService.store`. The screen says only that the upload was cancelled, never that
 * the archive stored nothing. Retrying a file that landed before the abort may add a second copy; a
 * server-side idempotency key is a later story, not a client fix.
 *
 * ## The order
 *
 * `items` is the display order (E4-S3B): dragging a tile calls `moveItem` from `lib/ordering/move.ts`,
 * which returns a new array — or the same one for a no-op — and nothing else. The slot is the index,
 * and since E4-S5A each tile carries the archive's photo, so the publish payload this screen builds is
 * those six stored photos, in this order — the order is read at the publish, not at the upload, so a
 * settled draft can still be rearranged. Reordering is refused while a batch is uploading or a publish
 * is in flight: the queue captured the array and the publish has read it, so a move mid-flight would
 * leave the wire disagreeing with the grid. The grid's own header carries the sensors, the scroll rule
 * and the keyboard path (E4-S3D): the tile is a real focus stop once the sensor for its keys exists.
 *
 * ## The publish
 *
 * With the sixth tile the panel grows the story's second action — an optional title and "Save archive"
 * (ADR-024 decision 2); `planPublish` decides whether the draft can leave, and a refusal is one
 * sentence in the panel, never a disabled button. A ready plan runs `usePublishDump` (E4-S5C): the
 * flight locks the draft ("Saving…" on the disabled button, the grid locked with it), success returns
 * where the workshop was entered from (`navigate(-1)`), and a failure stays — the draft intact and one
 * sentence about it (ADR-024 decision 5; the wording is `lib/publish/sentence.ts`).
 *
 * ## The files never outlive the screen
 *
 * Each preview is an object URL created from the picked `File`; it is revoked when its tile is removed
 * and for everything still held when the view unmounts. A success no longer revokes it (E4-S5A: the
 * tile stays, showing the user's own photo). The `File`s are React state; **only the aura persists** —
 * one `sessionStorage` value the curator chose (E4-S4C, ADR-023 decision 4), never a `File`. An
 * in-flight request is aborted on unmount, and no file name or content is logged.
 */

type Phase = "idle" | "selected" | "uploading" | "error";

/** One sentence, for a failure the archive named. The server's `detail` is for the operator, never the screen. */
function failureSentence(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "unsupported-image-type") {
      return "The archive couldn't read that image.";
    }
    if (error.code === "upload-too-large") {
      return "That photo is larger than the archive accepts.";
    }
    if (error.kind === "network" || error.kind === "timeout") {
      return "The archive didn't answer. Try again.";
    }
  }
  return "That photo couldn't be added.";
}

/** The hidden-input label's focus ring, shared by the idle picker and the panel's "Add photos". */
const PICKER_LABEL_FOCUS =
  "peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-aura-text/70";

export function WorkshopView() {
  const [items, setItems] = useState<SelectionItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<UploadProgress>({ loaded: 0, total: 0 });
  /** The publish's optional title, raw: the plan trims it and the server counts the trimmed value. */
  const [title, setTitle] = useState("");
  const titleId = useId();

  const controllerRef = useRef<AbortController | null>(null);
  /** Set by Cancel; the loop checks it before starting each file, and after a response wins the race. */
  const cancelledRef = useRef(false);
  /** False after unmount, so an in-flight rejection or a late progress event cannot set state on a dead tree. */
  const aliveRef = useRef(true);
  const nextIdRef = useRef(0);
  /** Every live preview URL, for the unmount sweep. */
  const previewUrlsRef = useRef(new Set<string>());
  const idleInputRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  /** The panel's "Add photos" input: the focus fallback of a settled draft (E4-S5A). */
  const panelInputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousPhase = useRef<Phase>("idle");
  /** The workshop's root: where a chosen aura's preview lands, and only there (ADR-023 decision 4). */
  const mainRef = useRef<HTMLElement>(null);

  const upload = useUploadPhoto();
  const publish = usePublishDump();
  const navigate = useNavigate();
  /** `publishing` is the mutation's own state; `busy` is one lock for both flights (decision 5). */
  const publishing = publish.isPending;
  const busy = uploading || publishing;

  /*
   * One phase, derived rather than stored: `uploading` wins, then a failed tile, then a non-empty grid,
   * then idle. Deriving it means an empty grid can never be called `selected`, and a settled batch
   * needs no branch of its own: its tiles stay (E4-S5A), so the draft reads `selected` — or `error`
   * while any failed tile remains.
   */
  const phase: Phase = uploading
    ? "uploading"
    : items.some((item) => item.state === "error")
      ? "error"
      : items.length > 0
        ? "selected"
        : "idle";

  /*
   * The aura (E4-S4C): suggestions off the selection and the preview on this view's root. Extraction
   * rests while the queue runs (`enabled`) — the decode must not compete with the uploads behind the
   * progress line, and the membership it keys to is stable through a batch (E4-S5A: no success removes
   * a tile) — and only the aura persists (ADR-023 decision 4).
   */
  const aura = useAura(items, mainRef, { enabled: !uploading });

  // Leaving the view cancels the request nobody is watching and releases every preview URL. The File
  // objects need no cleanup: they are references, and React drops them with the component.
  //
  // `aliveRef` is re-armed in the **setup**, not only cleared in the teardown: StrictMode runs every
  // effect setup → cleanup → setup on mount, so a cleanup-only reset leaves the ref false before the
  // first interaction and the queue never starts (`npm run dev` only — a built bundle cannot see it).
  useEffect(() => {
    aliveRef.current = true;
    // The Set is created once and mutated in place, so capturing the object here is the same set the
    // rest of the component writes to — and it is the form the exhaustive-deps rule can read.
    const previewUrls = previewUrlsRef.current;
    return () => {
      aliveRef.current = false;
      controllerRef.current?.abort();
      for (const url of previewUrls) {
        URL.revokeObjectURL(url);
      }
      previewUrls.clear();
    };
  }, []);

  /*
   * Focus follows the phase, so a pick that replaces the picker with the grid does not strand keyboard
   * focus on a removed element: Cancel while uploading, the primary action after a selection or a
   * failure, the picker again after everything succeeded. The first render is deliberately exempt —
   * autofocusing a file input on arrival would move a screen reader's place before it has read the view.
   *
   * Since E4-S5A the primary action is conditional: the queue button is only rendered while something is
   * still to send (it would be a no-op over a settled draft), so a settled selection falls through to
   * the panel's picker — the draft's next move is adding to it.
   */
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (phase === previous) {
      return;
    }
    if (phase === "uploading") {
      cancelRef.current?.focus();
    } else if (phase === "idle") {
      idleInputRef.current?.focus();
    } else {
      (primaryRef.current ?? panelInputRef.current)?.focus();
    }
  }, [phase]);

  const revokePreview = (url: string): void => {
    URL.revokeObjectURL(url);
    previewUrlsRef.current.delete(url);
  };

  /** Turns accepted files into tiles, creating and tracking one object URL each. */
  const addItems = (accepted: readonly File[]): SelectionItem[] =>
    accepted.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      previewUrlsRef.current.add(previewUrl);
      const item: SelectionItem = {
        id: `selection-${nextIdRef.current}`,
        file,
        photo: null,
        uploadFile: null,
        previewUrl,
        state: "waiting",
        message: null,
        previewBroken: false,
      };
      nextIdRef.current += 1;
      return item;
    });

  const handlePick = (event: ChangeEvent<HTMLInputElement>): void => {
    const picked = event.target.files === null ? [] : Array.from(event.target.files);
    // Clear the native value on every pick, not only on a refusal: a multi-select input otherwise keeps
    // its old FileList, and picking the same photos again (after removing a tile) fires no `change`.
    event.target.value = "";
    if (picked.length === 0) {
      return;
    }

    const plan = planSelection(items.length, picked);
    if (plan.accepted.length > 0) {
      const added = addItems(plan.accepted);
      setItems((previous) => [...previous, ...added]);
    }
    // Every refusal is named and every overflow is counted; an empty plan clears the previous sentence.
    setNotice(selectionNotices(plan).join(" "));
  };

  /**
   * A drag's outcome, as one array move. The reducer returns the input array for a no-op, so a drag
   * that ends where it began does not re-render the grid. The guard repeats the grid's `busy`
   * decision: the queue holds a snapshot of the order and a publish has already read the array, so a
   * move mid-flight must not change it.
   */
  const moveSelection = (from: number, to: number): void => {
    if (busy) {
      return;
    }
    setItems((previous) => {
      // `moveItem` returns a readonly array by design (it never mutates); the state is mutable, so
      // the spread is a type requirement, not a second copy of intent. A no-op returns the same
      // reference and React skips the render.
      const moved = moveItem(previous, from, to);
      return moved === previous ? previous : [...moved];
    });
  };

  const removeItem = (id: string): void => {
    if (busy) {
      return;
    }
    const item = items.find((candidate) => candidate.id === id);
    if (item === undefined) {
      return;
    }
    revokePreview(item.previewUrl);
    setItems((previous) => previous.filter((candidate) => candidate.id !== id));
    setNotice("");
  };

  const markPreviewBroken = (id: string): void => {
    setItems((previous) =>
      previous.map((item) => (item.id === id ? { ...item, previewBroken: true } : item)),
    );
  };

  /**
   * Sends the given tiles in order, one request at a time. A failure is recorded on its own tile and the
   * loop continues; an abort stops the loop and returns the current tile to waiting.
   */
  const runQueue = async (queue: readonly SelectionItem[]): Promise<void> => {
    let added = 0;
    let failed = 0;

    for (const entry of queue) {
      if (!aliveRef.current || cancelledRef.current) {
        break;
      }

      // Prepare the bytes before the request: downscale is async, and a cancel or an unmount can land
      // while it runs, so the loop re-checks both afterwards. `uploadFile` is the item's memory of a
      // previous attempt — a retry sends exactly that object and never encodes twice.
      let prepared: File;
      try {
        prepared = entry.uploadFile ?? (await downscaleForUpload(entry.file));
      } catch {
        // The library already returns the original on its own failures; this catch exists so a future
        // rejection can never strand a tile. A downscale failure must never block an upload.
        prepared = entry.file;
      }
      if (!aliveRef.current) {
        return;
      }
      if (cancelledRef.current) {
        break;
      }

      const controller = new AbortController();
      controllerRef.current = controller;
      // The line describes the bytes actually sent, not the source file.
      setProgress({ loaded: 0, total: prepared.size });
      setItems((previous) =>
        previous.map((item) =>
          item.id === entry.id
            ? { ...item, state: "uploading", message: null, uploadFile: prepared }
            : item,
        ),
      );

      try {
        const photo = await upload.mutateAsync({
          file: prepared,
          signal: controller.signal,
          onProgress: (next) => {
            // Two races, one gate: the request must still be the one on screen (a late event from a
            // settled request must not move the next file's line), and the view must still exist (an
            // event after unmount must not set state on a dead tree). The decision is pure and tested
            // in `lib/upload/progress.ts`.
            if (isCurrentProgress(aliveRef.current, controllerRef.current, controller)) {
              setProgress(next);
            }
          },
        });

        if (!aliveRef.current) {
          return;
        }
        controllerRef.current = null;
        added += 1;
        // The draft survives its upload (E4-S5A): the tile stays, marked `added` and carrying the
        // archive's photo — the six of them, in this order, are what the publish will read. Its
        // preview is not revoked here; removal and unmount are the only exits now.
        setItems((previous) =>
          previous.map((item) =>
            item.id === entry.id ? { ...item, state: "added", photo, message: null } : item,
          ),
        );
      } catch (error) {
        if (!aliveRef.current) {
          return;
        }
        controllerRef.current = null;
        if (controller.signal.aborted) {
          // Cancellation is the user's choice, not a failure: the file goes back to waiting and the
          // queue stops here. It does not claim the archive stored nothing — see the header.
          setItems((previous) =>
            previous.map((item) =>
              item.id === entry.id ? { ...item, state: "waiting", message: null } : item,
            ),
          );
          setProgress({ loaded: 0, total: 0 });
          setUploading(false);
          setNotice("Upload cancelled.");
          return;
        }
        failed += 1;
        setItems((previous) =>
          previous.map((item) =>
            item.id === entry.id
              ? { ...item, state: "error", message: failureSentence(error) }
              : item,
          ),
        );
        continue;
      }
    }

    if (!aliveRef.current) {
      return;
    }
    controllerRef.current = null;
    setUploading(false);

    // A Cancel that landed after the last response had nothing to stop: the queue processed every
    // file, and the summary — which counts the stored photo — is the honest sentence. Only a cancel
    // that actually stopped the loop says "cancelled". Measured in review: the old check overwrote a
    // summary whose 201 the client had already received, while the transport's abort was a no-op.
    if (cancelledRef.current && added + failed < queue.length) {
      setNotice("Upload cancelled.");
      return;
    }
    setNotice(queueSummary(added, failed));
  };

  const startUpload = (): void => {
    if (uploading) {
      return;
    }
    const queue = items.filter((item) => item.state === "waiting" || item.state === "error");
    if (queue.length === 0) {
      return;
    }

    const queuedIds = new Set(queue.map((item) => item.id));
    // Each batch starts un-cancelled. Without this reset a batch after a cancelled one stops at its
    // first check and says "Upload cancelled." without opening a request.
    cancelledRef.current = false;
    setNotice("");
    setUploading(true);
    const head = queue[0];
    // A retried file already knows the size it will send. An unprepared one does not: downscaling
    // happens first, so the line is indeterminate (the quiet pulse) until the loop knows the bytes —
    // claiming the source size here would describe a file that is not the one being sent.
    setProgress({ loaded: 0, total: head?.uploadFile?.size ?? 0 });
    // A retry re-queues failed tiles; they are waiting again until their own request opens.
    setItems((previous) =>
      previous.map((item) =>
        queuedIds.has(item.id) ? { ...item, state: "waiting", message: null } : item,
      ),
    );
    void runQueue(queue);
  };

  const cancelUpload = (): void => {
    // The queue checks the flag before each file and after the last one; the abort covers the request
    // in flight. With no controller the queue has settled (or is between files), and its own post-loop
    // sentence — the summary when nothing was stopped — is the right one. Writing "cancelled" here
    // would overwrite a summary whose photo the archive already stored (the review's measured race).
    cancelledRef.current = true;
    controllerRef.current?.abort();
  };

  /**
   * The publish: the plan is pure (E4-S5B) and a refusal is one sentence in the panel; a ready plan
   * goes through `usePublishDump` (E4-S5C), whose optimistic insert precedes the answer. Success
   * returns where the workshop was entered from; a failure restores the cache (the hook) and shows one
   * sentence, the draft exactly as it was (ADR-024 decision 5).
   */
  const saveArchive = (): void => {
    if (busy) {
      return;
    }
    const plan = planPublish(items, aura.chosen, title);
    if (plan.status === "blocked") {
      setNotice(plan.sentence);
      return;
    }
    setNotice("");
    void publish
      .mutateAsync({ body: plan.body, photos: plan.photos })
      .then(() => {
        // A publish that landed while the curator was elsewhere must not pull them back.
        if (aliveRef.current) {
          navigate(-1);
        }
      })
      .catch((error: unknown) => {
        if (aliveRef.current) {
          setNotice(publishErrorSentence(error));
        }
      });
  };

  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;

  // Something left to send: the queue button's reason to exist. Over a settled draft it would be a
  // no-op, so it is not rendered (E4-S5A) — and focus falls through to the panel's picker.
  const queueable = items.some((item) => item.state === "waiting" || item.state === "error");

  const panelSentence = notice !== "" ? notice : selectionSentence(items.length);
  // The constant "Uploading." is the batch's announcement: the persistent region is the only thing
  // announced while the queue runs, and a mid-batch failure is carried by the settled summary. The
  // publish gets a constant for the same reason — "Saving…" is on a disabled button.
  const announcement =
    phase === "uploading"
      ? "Uploading."
      : publishing
        ? "Saving the dump."
        : phase === "idle"
          ? notice
          : panelSentence;

  return (
    <>
      <main
        ref={mainRef}
        data-state={phase}
        className="relative flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-aura-bg lg:overflow-hidden"
      >
        <h1 className="sr-only">Curator&rsquo;s Workshop</h1>

        {phase === "idle" ? (
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
            <p className="max-w-xs font-display text-xl font-normal tracking-display text-aura-text">
              Add photos to your archive.
            </p>
            <label className={QUIET_ACTION}>
              <input
                ref={idleInputRef}
                type="file"
                // Multi-select: the picker may hand back up to the whole selection in one change.
                multiple
                accept={ACCEPT_ATTRIBUTE}
                onChange={handlePick}
                className="peer sr-only"
              />
              <span className={PICKER_LABEL_FOCUS}>Choose photos</span>
            </label>
            {notice !== "" ? (
              <p data-testid="workshop-notice" className="max-w-xs text-sm text-aura-text">
                {notice}
              </p>
            ) : null}
          </div>
        ) : (
          <div className="relative z-10 grid min-h-full w-full grid-cols-1 lg:h-full lg:min-h-0 lg:flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(21rem,27rem)]">
            <div className="flex min-w-0 flex-col justify-center px-4 py-8 sm:px-6 lg:min-h-0 lg:overflow-y-auto lg:px-10 lg:py-12">
              <div className="mx-auto w-full max-w-5xl">
                <SelectionGrid
                  items={items}
                  busy={busy}
                  onMove={moveSelection}
                  onRemove={removeItem}
                  onPreviewError={markPreviewBroken}
                />
              </div>
            </div>

            <div className="w-full px-4 pb-[calc(var(--safe-bottom)_+_1.25rem)] pt-2 sm:px-6 lg:min-h-0 lg:overflow-y-auto lg:px-6 lg:py-8 xl:px-8">
              <GlassPanel
                className={`mx-auto flex w-full max-w-xl flex-col gap-3 px-4 py-4 sm:px-5 lg:gap-4 ${ENTER_FADE_BASE}`}
              >
                {phase === "uploading" ? (
                  <>
                    <p className="text-sm text-aura-text">Uploading</p>
                    {/* `data-total` is the byte total the line is computed against — for the tests
                        and the probe. It is never painted, and the user never reads a percentage. */}
                    <div
                      role="progressbar"
                      aria-label="Upload progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      {...(percent === null ? {} : { "aria-valuenow": percent })}
                      data-total={progress.total}
                      className="h-0.5 w-full overflow-hidden rounded-full bg-aura-text/15"
                    >
                      {percent === null ? (
                        <div className={`h-full w-full bg-aura-text opacity-25 ${LOADING_PULSE}`} />
                      ) : (
                        <div className="h-full bg-aura-text" style={{ width: `${percent}%` }} />
                      )}
                    </div>
                    <button
                      ref={cancelRef}
                      type="button"
                      onClick={cancelUpload}
                      className={QUIET_ACTION}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <p
                      data-testid="workshop-notice"
                      className="text-base break-words text-aura-text"
                    >
                      {panelSentence}
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      {queueable ? (
                        <button
                          ref={primaryRef}
                          type="button"
                          onClick={startUpload}
                          className={QUIET_ACTION}
                        >
                          {phase === "error" ? "Try again" : "Upload"}
                        </button>
                      ) : null}
                      <label className={QUIET_ACTION}>
                        <input
                          ref={panelInputRef}
                          type="file"
                          multiple
                          accept={ACCEPT_ATTRIBUTE}
                          onChange={handlePick}
                          disabled={publishing}
                          className="peer sr-only"
                        />
                        <span className={PICKER_LABEL_FOCUS}>Add photos</span>
                      </label>
                    </div>
                    <AuraPicker
                      chosen={aura.chosen}
                      suggestions={aura.suggestions}
                      onChoose={aura.choose}
                      onReset={aura.reset}
                    />
                    {items.length === DUMP_PHOTO_COUNT ? (
                      // The publish group (ADR-024 decision 2): with the sixth tile the panel offers
                      // the save; a click it cannot send is answered with one sentence.
                      <section
                        aria-label="Publish"
                        className="flex flex-col gap-2 border-t border-aura-text/15 pt-3"
                      >
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <label
                            htmlFor={titleId}
                            className="text-xs tracking-wide text-aura-text uppercase"
                          >
                            Title
                          </label>
                          <input
                            id={titleId}
                            type="text"
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            placeholder="Optional"
                            autoComplete="off"
                            disabled={publishing}
                            className="min-h-11 min-w-40 flex-1 rounded-[10px] bg-transparent px-3 text-sm text-aura-text [border:var(--aura-hairline)] placeholder:text-aura-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-aura-text/70 disabled:opacity-60"
                          />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={saveArchive}
                            disabled={publishing}
                            aria-busy={publishing}
                            className={`${QUIET_ACTION} disabled:opacity-60`}
                          >
                            {publishing ? "Saving…" : "Save archive"}
                          </button>
                        </div>
                      </section>
                    ) : null}
                  </>
                )}
              </GlassPanel>
            </div>
          </div>
        )}
      </main>

      {/* The persistent live region, a sibling of `<main>` for the reason E3-S5B measured: a region
          inserted together with its text is not reliably announced. The visible sentences are ordinary
          paragraphs and a test pins the words equal. Since E4-S3B the sortable grid mounts dnd-kit's
          own `role="status"` live region beside this one, so the workshop's region carries a test id:
          the two speak for different things and must not be confused. */}
      <p role="status" data-testid="workshop-status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
