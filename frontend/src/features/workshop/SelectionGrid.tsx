/**
 * The selection grid — one tile per picked photo, with its own state and its own way out (E4-S2A).
 *
 * ## Why it is a separate component
 *
 * The grid has one job and no decisions: it renders the items the workshop hands it and reports the two
 * things a user can do to a tile — remove it, or let its preview fail. The queue, the cap and the object
 * URLs stay in `WorkshopView`. That split is what keeps this file free of state and makes the accessible
 * structure (a real list, real buttons) easy to read in one place.
 *
 * ## The tile
 *
 * A photo, a dark scrim that is always mounted, and a remove button in the corner. The scrim is the
 * E4-S1A fix carried into the grid: when a preview cannot decode, the `<img>` is dropped but the tile is
 * not, so the browser's broken-image glyph never shows and the layout does not shift — the scrim is the
 * backdrop either way. `loading="lazy"` and `decoding="async"` follow the rendering rule for every image
 * except the splash hero.
 *
 * The remove button is a real `<button>` with its own 44 × 44 hit area. Its visible disc is smaller
 * (28 px) so a 114 px thumbnail is not half covered by a control, but the tappable area is the whole
 * 44 px square — the Apple HIG's "visible glyph may be smaller than the tappable area", and the project's
 * own ≥ 44 px rule. The button's accessible name is "Remove <file name>", so two photos called the same
 * thing still have a name each; `aria-hidden` on the glyph keeps the name from being read twice.
 *
 * While a batch is uploading, every remove button is disabled rather than removed: the queue holds a
 * snapshot of the files, and letting a tile vanish mid-batch would leave the summary counting something
 * the user can no longer see. The button stays in place, visibly quiet, and comes back when the batch
 * settles.
 *
 * ## The state line
 *
 * Under each tile, one short sentence: "Waiting", "Uploading", "Added", or the per-file failure sentence.
 * A screen reader hears the file's name first (the `sr-only` span), so six "Waiting" lines do not become
 * six anonymous ones. The line is ordinary text, not a live region: the workshop mounts one persistent
 * status region for announcements, and inserting a second one per tile would multiply every event by six.
 * `data-state` on the list item carries the same information for tests and for anyone inspecting the DOM.
 */

/** Where one selected file is in the queue. `done` exists for the instant between success and removal. */
export type ItemState = "waiting" | "uploading" | "done" | "error";

/** One tile: the File, its preview URL, and what the screen knows about it. */
export interface SelectionItem {
  readonly id: string;
  readonly file: File;
  readonly previewUrl: string;
  readonly state: ItemState;
  /** The quiet failure sentence for `error`; `null` in every other state. */
  readonly message: string | null;
  /** The preview failed to decode; the tile keeps its scrim and drops the `<img>`. */
  readonly previewBroken: boolean;
}

export interface SelectionGridProps {
  readonly items: readonly SelectionItem[];
  /** True while the queue is running: removal waits for the batch to settle. */
  readonly busy: boolean;
  readonly onRemove: (id: string) => void;
  readonly onPreviewError: (id: string) => void;
}

/** The sentence under a tile. `done` never paints in practice; it is spelled out for completeness. */
function statusSentence(item: SelectionItem): string {
  switch (item.state) {
    case "waiting":
      return "Waiting";
    case "uploading":
      return "Uploading";
    case "done":
      return "Added";
    case "error":
      return item.message ?? "That photo couldn't be added.";
  }
}

/** The file's own name, never a path. An empty name still yields a usable accessible name. */
function removeLabel(item: SelectionItem): string {
  return item.file.name === "" ? "Remove photo" : `Remove ${item.file.name}`;
}

/** The grid: a list for assistive tech, and one focal point — the photos. */
export function SelectionGrid({ items, busy, onRemove, onPreviewError }: SelectionGridProps) {
  return (
    <ul role="list" aria-label="Selected photos" className="grid grid-cols-3 items-start gap-2">
      {items.map((item) => (
        <li key={item.id} data-state={item.state} className="min-w-0">
          <div className="relative aspect-square overflow-hidden rounded-[14px]">
            {/* Always mounted: the known backdrop a failed preview falls back to (E4-S1A). */}
            <div aria-hidden="true" className="absolute inset-0 bg-aura-bg/70" />

            {item.previewBroken ? null : (
              <img
                src={item.previewUrl}
                alt=""
                aria-hidden="true"
                decoding="async"
                loading="lazy"
                onError={() => onPreviewError(item.id)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}

            <button
              type="button"
              aria-label={removeLabel(item)}
              disabled={busy}
              onClick={() => onRemove(item.id)}
              className="absolute top-1 right-1 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-colors duration-[var(--motion-duration-quick)] active:bg-aura-bg/20 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/50 disabled:cursor-default disabled:opacity-40"
            >
              {/* The visible disc is the button's own scrim, not a second surface. */}
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-aura-bg/70 text-aura-text">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.25}
                  strokeLinecap="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
                </svg>
              </span>
            </button>
          </div>

          <p className="mt-1 text-xs break-words text-aura-text">
            <span className="sr-only">{item.file.name === "" ? "Photo" : item.file.name}: </span>
            {statusSentence(item)}
          </p>
        </li>
      ))}
    </ul>
  );
}
