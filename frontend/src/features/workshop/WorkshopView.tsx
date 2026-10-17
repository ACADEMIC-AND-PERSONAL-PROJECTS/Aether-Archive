import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { GlassPanel } from "../../components/GlassPanel";
import { ENTER_FADE_BASE } from "../../lib/motion/tokens";
import { ACCEPT_ATTRIBUTE, validateUpload } from "../../lib/upload/validation";

/**
 * `GET /curate` — the Curator's Workshop, slice A: pick and validate one photo (E4-S1A).
 *
 * ## The screen
 *
 * With nothing picked, the view is one display-serif sentence and one quiet action: the archive has no
 * imagery yet, so there is nothing to decorate and nothing else to say. Once a photo is picked, the
 * photo is the screen — full-bleed, under the theme's own scrim — and the only chrome is a single glass
 * panel at the bottom saying that the photo is selected, with the picker one tap away.
 *
 * The glass is over the scrim, never over an uncontrolled backdrop. That is §3's scrim rule and NN/g's
 * finding (DESIGN-REFERENCES §7): a translucent panel's contrast depends on what is behind it, so the
 * preview is scrimmed with `--aura-bg` at 70 % — the menu veil's value — before the panel composites
 * over it. When a preview cannot decode it is dropped, but the same scrim remains over the theme's base,
 * so the panel always sits on a known tone rather than on the raw base alone. The words in the panel are
 * `--aura-text`, never `--aura-muted` (DESIGN-SYSTEM §2.2, measured in E3-S2).
 *
 * ## What this slice does not do
 *
 * This screen only picks, validates and shows. It sends no request and has no upload action, progress,
 * cancellation, retry or cache invalidation — those are slices B and C of E4-S1. The panel therefore
 * says "Photo selected." and nothing about adding, uploading or retrying, so it cannot promise an
 * action that does not exist yet.
 *
 * ## The client is an experience measure, not a boundary
 *
 * `validateUpload` mirrors the server's *declared-type* axis, its emptiness rule and its size ceiling,
 * so an obviously wrong pick gets a sentence immediately instead of after a transfer. It does not sniff
 * magic bytes: text bytes declared `image/png` pass this check and are refused by the server's sniff
 * when they are eventually uploaded, one round trip later. The server remains the authority for the
 * bytes and for the size; this check exists to avoid a pointless upload, not to replace the refusal.
 *
 * ## The file never outlives the screen
 *
 * The preview is an object URL created from the picked File and revoked when the selection is replaced
 * or the view unmounts; nothing is written to localStorage, IndexedDB or a cache, and no file name or
 * content is logged. A file whose declared type is an image but whose bytes do not decode would show
 * the browser's broken-image glyph through the scrim, so the preview is dropped on `error` while the
 * selection survives (probed in Chromium 152, E4-S1).
 */

type Phase = "idle" | "selected";

/** The quiet action grammar: text, a 44 px target, a 180 ms press, an inset focus ring. */
const QUIET_ACTION =
  "flex min-h-11 shrink-0 cursor-pointer items-center rounded-[10px] px-3 text-sm text-aura-text underline decoration-aura-text/40 underline-offset-4 transition-colors duration-[var(--motion-duration-quick)] active:bg-aura-text/6 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/50";

export function WorkshopView() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [notice, setNotice] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBroken, setPreviewBroken] = useState(false);

  const previewRef = useRef<string | null>(null);
  const idleInputRef = useRef<HTMLInputElement>(null);
  const secondaryInputRef = useRef<HTMLInputElement>(null);
  const previousPhase = useRef<Phase>("idle");

  // Leaving the view releases the preview's object URL. The File itself is never held in state here:
  // this slice only shows the image; a later slice keeps the File in its own selection state.
  useEffect(
    () => () => {
      if (previewRef.current !== null) {
        URL.revokeObjectURL(previewRef.current);
      }
    },
    [],
  );

  /*
   * Focus follows the state, so a pick that replaces the picker with a panel does not strand keyboard
   * focus on a removed element: the replace-picker action, or the picker again after a refused pick.
   * The first render is deliberately exempt — autofocusing a file input on arrival would move a screen
   * reader's place before the user has read the view's name.
   */
  useEffect(() => {
    const previous = previousPhase.current;
    previousPhase.current = phase;
    if (phase === "selected") {
      secondaryInputRef.current?.focus();
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
  };

  const choose = (chosen: File): void => {
    clearSelection();
    const url = URL.createObjectURL(chosen);
    previewRef.current = url;
    setPreviewUrl(url);
    setPreviewBroken(false);
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

  const announcement = notice !== "" ? notice : phase === "selected" ? "Photo selected." : "";

  return (
    <>
      <main data-state={phase} className="relative flex flex-1 flex-col overflow-hidden bg-aura-bg">
        <h1 className="sr-only">Curator&rsquo;s Workshop</h1>

        {previewUrl !== null ? (
          <>
            {previewBroken ? null : (
              <img
                src={previewUrl}
                alt=""
                aria-hidden="true"
                decoding="async"
                loading="lazy"
                onError={() => setPreviewBroken(true)}
                className={`absolute inset-0 h-full w-full object-cover ${ENTER_FADE_BASE}`}
              />
            )}
            {/* §3's scrim: the glass panel needs a known backdrop, and the theme's own tone is the one
                the user is already inside. 70 % is the menu veil's value. It stays when the preview is
                dropped, so a browser that cannot decode the bytes does not leave the panel over the raw
                base alone — the backdrop is the same known scrim either way. */}
            <div aria-hidden="true" className="absolute inset-0 bg-aura-bg/70" />
          </>
        ) : null}

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
          <div className="absolute inset-x-4 bottom-4 z-10 mx-auto max-w-md">
            <GlassPanel className={`flex flex-col gap-3 px-4 py-3 ${ENTER_FADE_BASE}`}>
              <p className="text-base text-aura-text">Photo selected.</p>
              <div className="flex items-center gap-2">
                <label className={QUIET_ACTION}>
                  <input
                    ref={secondaryInputRef}
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
            </GlassPanel>
          </div>
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
