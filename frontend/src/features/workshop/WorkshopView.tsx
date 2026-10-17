import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { SelectionGrid, type SelectionItem } from "./SelectionGrid";
import { ApiError } from "../../api/client";
import { useUploadPhoto } from "../../api/photos";
import { GlassPanel } from "../../components/GlassPanel";
import { ENTER_FADE_BASE, LOADING_PULSE } from "../../lib/motion/tokens";
import { ACCEPT_ATTRIBUTE, validateUpload } from "../../lib/upload/validation";

import type { UploadProgress } from "../../api/uploadPhoto";

/**
 * `GET /curate` — the Curator's Workshop, grid slice: the picked photo as a tile (E4-S2A1).
 *
 * ## The screen
 *
 * With nothing picked, the view is one display-serif sentence and one quiet action: the archive has no
 * imagery yet, so there is nothing to decorate and nothing else to say. Once a photo is picked, it
 * becomes a **tile in a selection grid** — the surface multi-select will grow into in E4-S2A2 — and the
 * only chrome is a single glass panel at the bottom. The send path (progress, cancel, retry,
 * invalidation) is E4-S1B's and is unchanged.
 *
 * The tile carries its own scrim, so its remove button and state line always sit on a known tone; the
 * panel sits over the theme's base, where its glass composites over `--aura-bg` rather than over a
 * photo. The words are `--aura-text`, never `--aura-muted` (DESIGN-SYSTEM §2.2, measured in E3-S2).
 *
 * ## The states, and what they promise
 *
 * `idle` → `selected` → `uploading` → `idle` (success) or `error`. From `error` the same File object is
 * retried; nothing is re-read from the input, so a failed upload cannot silently lose the selection.
 * Cancelling returns to `selected` with the file intact — cancellation is not failure, and the visible
 * panel says "Upload cancelled." rather than leaving the fact only in the live region.
 *
 * **Cancellation is not a rollback.** The request is aborted client-side, but a cancel can race the
 * response: if the archive had already accepted the body and stored the photo, the photo remains and
 * appears on the next refresh. So the screen never says "nothing was saved"; the honest sentence is the
 * one it shows. The README states the same caveat.
 *
 * A refused *pick* (wrong type, too large, empty) never reaches the network: the sentence says why, in
 * the same quiet slot, and the picker stays one tap away. The client check is an experience measure, not
 * a boundary — the server still sniffs the bytes and enforces the ceiling.
 *
 * The progress bar is the app's one labelled progress element on purpose (the story asks for an upload
 * progress indicator); everywhere else loading is the silent pulse of §7. It is a 2 px line, no
 * percentage, no spinner, and it reports `aria-valuenow` from the real `upload.onprogress` events. When
 * the browser cannot compute the length (`lengthComputable === false`) the line becomes the silent
 * pulse instead of inventing a number.
 *
 * ## The transport
 *
 * `api/uploadPhoto.ts` — XHR, because only `XMLHttpRequest.upload` reports request progress and can
 * cancel in flight in every target browser. This view owns the `AbortController`, the preview URL and
 * the phase; the request, the `ApiError` mapping and the cache invalidation are the API layer's.
 *
 * ## The file never outlives the screen
 *
 * The preview is an object URL created from the picked File and revoked when the selection is replaced
 * or the view unmounts; the File itself is React state, and **nothing is persisted** — no localStorage,
 * no IndexedDB, no disk. TanStack's mutation cache holds the File in memory until its gc, which is a
 * cache in RAM, not storage. An in-flight request is aborted on unmount. No file name or content is
 * logged.
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

/** The quiet action grammar: text, a 44 px target, a 180 ms press, an inset focus ring. */
const QUIET_ACTION =
  "flex min-h-11 shrink-0 cursor-pointer items-center rounded-[10px] px-3 text-sm text-aura-text underline decoration-aura-text/40 underline-offset-4 transition-colors duration-[var(--motion-duration-quick)] active:bg-aura-text/6 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/50";

export function WorkshopView() {
  const [file, setFile] = useState<File | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState<UploadProgress>({ loaded: 0, total: 0 });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);

  const previewRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const idleInputRef = useRef<HTMLInputElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const previousPhase = useRef<Phase>("idle");

  const upload = useUploadPhoto();

  // Leaving the view cancels a request nobody is watching and releases the preview's object URL. The
  // File itself needs no cleanup: it is a reference, and React drops it with the component.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      if (previewRef.current !== null) {
        URL.revokeObjectURL(previewRef.current);
      }
    },
    [],
  );

  /*
   * Focus follows the state, so a pick that replaces the picker with a panel does not strand keyboard
   * focus on a removed element: the panel's action, the cancel action, or the picker again after a
   * refusal or a success. The first render is deliberately exempt — autofocusing a file input on
   * arrival would move a screen reader's place before the user has read the view's name.
   */
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (phase === "selected" || phase === "error") {
      primaryRef.current?.focus();
    } else if (phase === "uploading") {
      cancelRef.current?.focus();
    } else if (previous !== "idle") {
      idleInputRef.current?.focus();
    }
  }, [phase]);

  const clearSelection = (): void => {
    if (previewRef.current !== null) {
      URL.revokeObjectURL(previewRef.current);
      previewRef.current = null;
    }
    setPreviewUrl(null);
    setPreviewBroken(false);
    setFile(null);
  };

  const choose = (chosen: File): void => {
    clearSelection();
    const url = URL.createObjectURL(chosen);
    previewRef.current = url;
    setPreviewUrl(url);
    setPreviewBroken(false);
    setFile(chosen);
    setProgress({ loaded: 0, total: chosen.size });
    setNotice("");
    setPhase("selected");
  };

  const handlePick = (event: ChangeEvent<HTMLInputElement>): void => {
    const picked = event.target.files?.[0];
    if (picked === undefined) {
      return;
    }
    const validation = validateUpload(picked);
    if (!validation.ok) {
      clearSelection();
      setPhase("idle");
      setNotice(validation.message);
      // Clear the native value, or picking the same file again would fire no `change` event.
      event.target.value = "";
      return;
    }
    choose(picked);
  };

  const startUpload = (chosen: File): void => {
    const controller = new AbortController();
    controllerRef.current = controller;
    setNotice("");
    setProgress({ loaded: 0, total: chosen.size });
    setPhase("uploading");

    upload.mutate(
      {
        file: chosen,
        signal: controller.signal,
        onProgress: setProgress,
      },
      {
        onSuccess: () => {
          controllerRef.current = null;
          clearSelection();
          setPhase("idle");
          setNotice("Added to your archive.");
        },
        onError: (error) => {
          controllerRef.current = null;
          if (controller.signal.aborted) {
            // Cancellation is the user's choice, not a failure: the same File stays selected and the
            // panel says so visibly. It does not claim the archive stored nothing — see the header.
            setPhase("selected");
            setNotice("Upload cancelled.");
            return;
          }
          setPhase("error");
          setNotice(failureSentence(error));
        },
      },
    );
  };

  const uploadSelected = (): void => {
    if (file !== null) {
      startUpload(file);
    }
  };

  const percent =
    progress.total > 0 ? Math.min(100, Math.round((progress.loaded / progress.total) * 100)) : null;

  const announcement =
    phase === "uploading"
      ? "Uploading."
      : notice !== ""
        ? notice
        : phase === "selected"
          ? "Photo selected."
          : "";

  const panelSentence = notice !== "" ? notice : "Photo selected.";

  /** The one selected file as a grid tile; the grid grows to many in E4-S2A2. */
  const selection: SelectionItem | null =
    file === null || previewUrl === null
      ? null
      : {
          id: "selection",
          file,
          previewUrl,
          state: phase === "uploading" ? "uploading" : phase === "error" ? "error" : "waiting",
          message: phase === "error" ? notice : null,
          previewBroken,
        };

  const removeSelected = (): void => {
    if (phase === "uploading") {
      return;
    }
    clearSelection();
    setPhase("idle");
    setNotice("");
  };

  return (
    <>
      <main data-state={phase} className="relative flex flex-1 flex-col overflow-hidden bg-aura-bg">
        <h1 className="sr-only">Curator&rsquo;s Workshop</h1>

        {phase === "idle" ? (
          <div className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
            <p className="max-w-xs font-display text-xl font-normal tracking-display text-aura-text">
              Add a photo to your archive.
            </p>
            <label className={QUIET_ACTION}>
              <input
                ref={idleInputRef}
                type="file"
                accept={ACCEPT_ATTRIBUTE}
                onChange={handlePick}
                className="peer sr-only"
              />
              <span className="peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-aura-text/50">
                Choose a photo
              </span>
            </label>
            {notice !== "" ? (
              <p data-testid="workshop-notice" className="max-w-xs text-sm text-aura-text">
                {notice}
              </p>
            ) : null}
          </div>
        ) : (
          <>
            {/* The grid scrolls; the panel does not. The scroll container itself centres a short grid —
                measured at the review: the tile's top lands on the computed centre (a `min-h-full`
                percentage does not resolve inside a flex-sized scroller, which put it at the top). */}
            <div className="relative z-10 flex flex-1 flex-col justify-center overflow-y-auto px-4 py-6">
              <SelectionGrid
                items={selection === null ? [] : [selection]}
                busy={phase === "uploading"}
                onRemove={removeSelected}
                onPreviewError={() => setPreviewBroken(true)}
              />
            </div>

            <div className="relative z-10 mx-auto w-full max-w-md shrink-0 px-4 pb-4">
              <GlassPanel className={`flex flex-col gap-3 px-4 py-3 ${ENTER_FADE_BASE}`}>
                {phase === "uploading" ? (
                  <>
                    <p className="text-sm text-aura-text">Uploading</p>
                    <div
                      role="progressbar"
                      aria-label="Upload progress"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      {...(percent === null ? {} : { "aria-valuenow": percent })}
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
                      onClick={() => controllerRef.current?.abort()}
                      className={QUIET_ACTION}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <p data-testid="workshop-notice" className="text-base text-aura-text">
                      {panelSentence}
                    </p>
                    <div className="flex items-center gap-2">
                      <button
                        ref={primaryRef}
                        type="button"
                        onClick={uploadSelected}
                        className={QUIET_ACTION}
                      >
                        {phase === "error" ? "Try again" : "Upload"}
                      </button>
                      <label className={QUIET_ACTION}>
                        <input
                          type="file"
                          accept={ACCEPT_ATTRIBUTE}
                          onChange={handlePick}
                          className="peer sr-only"
                        />
                        <span className="peer-focus-visible:outline peer-focus-visible:outline-1 peer-focus-visible:-outline-offset-4 peer-focus-visible:outline-aura-text/50">
                          Choose another
                        </span>
                      </label>
                    </div>
                  </>
                )}
              </GlassPanel>
            </div>
          </>
        )}
      </main>

      {/* The persistent live region, a sibling of `<main>` for the reason E3-S5B measured: a region
          inserted together with its text is not reliably announced. The visible sentences are ordinary
          paragraphs and a test pins the words equal. */}
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </>
  );
}
