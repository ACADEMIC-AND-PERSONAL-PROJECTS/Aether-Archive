import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useState, type CSSProperties } from "react";

import { prefersReducedMotion } from "../../lib/motion/reduced";
import { EASE_SOFT } from "../../lib/motion/tokens";
import {
  AUTO_SCROLL_OPTIONS,
  DROP_ANIMATION_MS,
  MOUSE_DRAG_DISTANCE_PX,
  SORT_SETTLE_MS,
  TOUCH_LONG_PRESS_DELAY_MS,
  TOUCH_LONG_PRESS_TOLERANCE_PX,
} from "../../lib/ordering/interaction";

/**
 * The selection grid — one tile per picked photo, with its own state and its own way out (E4-S2A1),
 * and since E4-S3 the place where the dump's order is arranged by pointer or finger.
 *
 * ## Why it is a separate component
 *
 * The grid has one job and no decisions: it renders the items the workshop hands it and reports the
 * things a user can do to a tile — remove it, let its preview fail, or move it. The queue, the cap,
 * the array order and the object URLs stay in `WorkshopView`. That split is what keeps this file free
 * of product state and makes the accessible structure (a real list, real buttons) easy to read in one
 * place. The one piece of state here is the **drag** — which tile is currently lifted — because that
 * exists only between pointer-down and drop and nothing outside the grid can observe it.
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
 * **The remove button is a sibling of the drag surface, not a child of it.** The activator covers the
 * image and carries dnd-kit's listeners; the button sits above it in a separate subtree. A pointer-down
 * on the button therefore never reaches a sensor, which is the structural half of "a tap on remove is
 * not a drag" — the other half is the sensors' own activation thresholds (8 px for a mouse, 250 ms for a
 * finger), pinned in `lib/ordering/interaction.ts`.
 *
 * While an upload is in flight, the remove button is disabled rather than removed, and dragging is
 * disabled for the same reason — the E4-S3B decision the story asked for: the queue reads the array
 * once when it starts, so a reorder mid-batch would make the grid disagree with the order the requests
 * are actually leaving in. Both controls come back when the request settles.
 *
 * ## The activator is not focusable yet, on purpose
 *
 * The keyboard sensor, dnd-kit's `attributes`, the announcements and the instructions are the second
 * half of E4-S3 (E4-S3D), not this slice. Spreading `attributes` without a sensor would put a control in the
 * tab order that does nothing when activated — a dead focus stop — and point a screen reader at keys
 * the grid does not listen for. So this slice spreads **only the listeners**: the activator is a
 * pointer/touch surface, the remove button stays the tile's only focusable control, and
 * `data-testid="drag-activator"` is what tests and the probe use.
 *
 * ## Reordering
 *
 * The array order is the display order (`lib/ordering/move.ts`); this component only reports a move as
 * `onMove(from, to)`. The sensors are split because the gestures are different: a mouse drag starts
 * after 8 px, a finger long-press starts after 250 ms and gives up if it travels more than 8 px — so a
 * swipe still scrolls the grid and a long press lifts the photo. `touch-action: manipulation` on the
 * activator keeps the swipe native and leaves pinch-zoom alone. `DndContext` auto-scrolls the nearest
 * `overflow-y-auto` ancestor with the tuned band in `AUTO_SCROLL_OPTIONS`, so a photo can be carried to
 * a row that is not on screen.
 *
 * ## The overlay
 *
 * `DragOverlay` carries a clone of the tile with the project's one soft shadow and a hairline edge; the
 * drop animation is `DROP_ANIMATION_MS` (250 ms, under the story's 300 ms ceiling) on the shared ease.
 * The clone is paint, not a second sortable.
 *
 * The state line is **inside the lifted surface**, on its own gradient scrim. Below the square it would
 * float over whatever the overlay happens to pass across — another photo — and the design language
 * forbids text over a busy photo without a scrim. Inside the lifted, already-scrimmed surface it stays
 * legible over a pale, dark or busy tile, and the drop animation measures the square alone rather than
 * the square plus a detached caption (`getMeasurableNode` returns the only child).
 *
 * **Reduced motion.** The global stylesheet freezes CSS animations *and transitions* under `reduce`
 * (block 5 of `global.css`), but the drop is a Web Animations API animation — no stylesheet rule can
 * reach it. The grid therefore reads `prefers-reduced-motion` itself (`lib/motion/reduced.ts`): the
 * sortable settle is `null` and the overlay has no drop animation when it is set. The direct
 * manipulation — the tile under the pointer — stays, as it is the drag itself rather than decorative
 * motion. `data-drop-animation` exposes which reading is active to the tests and the probe.
 *
 * ## The state line
 *
 * Under each tile, one short sentence: "Waiting", "Uploading", "Added", or the per-file failure sentence.
 * A screen reader hears the file's name first (the `sr-only` span), so six "Waiting" lines do not become
 * six anonymous ones. The line is ordinary text, not a live region: the workshop mounts one persistent
 * status region for announcements, and inserting a second one per tile would multiply every event by six.
 * `data-state` on the list item carries the same information for tests and for anyone inspecting the DOM.
 */

/** Where one selected file is in the queue. A success removes the tile, so there is no `done` state. */
export type ItemState = "waiting" | "uploading" | "error";

/** One tile: the File, its preview URL, and what the screen knows about it. */
export interface SelectionItem {
  readonly id: string;
  /** The picked file. The tile preview always comes from this object, never from the re-encode. */
  readonly file: File;
  /**
   * What the queue will send: the downscaled `File` once E4-S2B has prepared it, the original before
   * that and whenever preparation failed. `null` until the first attempt; keeping it here is what lets
   * "Try again" resend the same object instead of re-encoding (and re-wrapping) it.
   */
  readonly uploadFile: File | null;
  readonly previewUrl: string;
  readonly state: ItemState;
  /** The quiet failure sentence for `error`; `null` in every other state. */
  readonly message: string | null;
  /** The preview failed to decode; the tile keeps its scrim and drops the `<img>`. */
  readonly previewBroken: boolean;
}

export interface SelectionGridProps {
  readonly items: readonly SelectionItem[];
  /** True while an upload is running: removal and dragging wait for the request to settle. */
  readonly busy: boolean;
  readonly onMove: (from: number, to: number) => void;
  readonly onRemove: (id: string) => void;
  readonly onPreviewError: (id: string) => void;
}

/**
 * The sortable transition is a module constant: `useSortable` rebuilds the CSS string from it, and a
 * fresh object each render would make every tile's style prop new for no reason.
 */
const SORTABLE_TRANSITION = { duration: SORT_SETTLE_MS, easing: EASE_SOFT } as const;

/** Tracks the reader's motion preference; a missing `matchMedia` (jsdom) reads as no preference. */
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => prefersReducedMotion());

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return;
    }
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = (): void => setReduced(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  return reduced;
}

/** The sentence under a tile. */
function statusSentence(item: SelectionItem): string {
  switch (item.state) {
    case "waiting":
      return "Waiting";
    case "uploading":
      return "Uploading";
    case "error":
      return item.message ?? "That photo couldn't be added.";
  }
}

/** The file's own name, never a path. An empty name still yields a usable accessible name. */
function removeLabel(item: SelectionItem): string {
  return item.file.name === "" ? "Remove photo" : `Remove ${item.file.name}`;
}

/** The artwork layer shared by the tile and its drag overlay: scrim, then the preview if it decoded. */
function TileFace({
  item,
  onPreviewError,
}: {
  readonly item: SelectionItem;
  readonly onPreviewError: (id: string) => void;
}) {
  return (
    <>
      {/* Always mounted: the known backdrop a failed preview falls back to (E4-S1A). */}
      <div data-testid="tile-scrim" aria-hidden="true" className="absolute inset-0 bg-aura-bg/70" />

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
    </>
  );
}

/** One sortable tile. `useSortable` may only live below `SortableContext`, never in the overlay. */
function SortableTile({
  item,
  busy,
  reducedMotion,
  onRemove,
  onPreviewError,
}: {
  readonly item: SelectionItem;
  readonly busy: boolean;
  readonly reducedMotion: boolean;
  readonly onRemove: (id: string) => void;
  readonly onPreviewError: (id: string) => void;
}) {
  const { listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      disabled: busy,
      transition: reducedMotion ? null : SORTABLE_TRANSITION,
    });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      data-state={item.state}
      data-dragging={isDragging ? "true" : undefined}
      // The slot stays measured while its photo is in the overlay; only the paint is hidden.
      className={`min-w-0 ${isDragging ? "opacity-0" : ""}`}
    >
      <div className="relative aspect-square overflow-hidden rounded-[14px]">
        {/* The drag surface. Deliberately a sibling of the remove button, and deliberately not a
            focus stop until the keyboard slice brings the sensor: see the header. */}
        <div
          ref={setActivatorNodeRef}
          {...listeners}
          data-testid="drag-activator"
          // `touch-action: manipulation` leaves vertical panning and pinch-zoom to the browser, so a
          // short swipe scrolls the grid instead of lifting the tile (measured in the Chromium probe).
          className="absolute inset-0 touch-manipulation rounded-[14px] [@media(pointer:fine)]:cursor-grab [@media(pointer:fine)]:active:cursor-grabbing"
        >
          <TileFace item={item} onPreviewError={onPreviewError} />
        </div>

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
  );
}

/** The grid: a list for assistive tech, and one focal point — the photos. */
export function SelectionGrid({
  items,
  busy,
  onMove,
  onRemove,
  onPreviewError,
}: SelectionGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: MOUSE_DRAG_DISTANCE_PX } }),
    useSensor(TouchSensor, {
      activationConstraint: {
        delay: TOUCH_LONG_PRESS_DELAY_MS,
        tolerance: TOUCH_LONG_PRESS_TOLERANCE_PX,
      },
    }),
  );

  const activeItem =
    activeId === null ? null : (items.find((item) => item.id === activeId) ?? null);

  const handleDragStart = (event: DragStartEvent): void => {
    setActiveId(String(event.active.id));
  };

  const handleDragEnd = (event: DragEndEvent): void => {
    // Cleared first: the overlay's drop animation keeps a clone of the previous children on screen
    // for its own duration even though this component has already stopped rendering the drag state.
    setActiveId(null);
    if (event.over === null) {
      return;
    }
    const from = items.findIndex((item) => item.id === event.active.id);
    const to = items.findIndex((item) => item.id === event.over?.id);
    if (from === -1 || to === -1 || from === to) {
      return;
    }
    onMove(from, to);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      autoScroll={AUTO_SCROLL_OPTIONS}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={rectSortingStrategy}
        disabled={busy}
      >
        <ul role="list" aria-label="Selected photos" className="grid grid-cols-3 items-start gap-2">
          {items.map((item) => (
            <SortableTile
              key={item.id}
              item={item}
              busy={busy}
              reducedMotion={reducedMotion}
              onRemove={onRemove}
              onPreviewError={onPreviewError}
            />
          ))}
        </ul>
      </SortableContext>

      {/* A clone, not a second sortable: calling `useSortable` here would register a duplicate id.
          `aria-hidden` because the tile's own text already describes it. The status line sits inside
          the lifted square on its own scrim: see the header. */}
      <DragOverlay
        dropAnimation={reducedMotion ? null : { duration: DROP_ANIMATION_MS, easing: EASE_SOFT }}
      >
        {activeItem === null ? null : (
          <div
            aria-hidden="true"
            data-testid="drag-overlay"
            data-drop-animation={reducedMotion ? "none" : `${DROP_ANIMATION_MS}ms`}
            className="w-full"
          >
            <div className="relative aspect-square w-full scale-[1.03] overflow-hidden rounded-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.24)] outline outline-1 -outline-offset-1 outline-aura-text/20">
              <TileFace item={activeItem} onPreviewError={onPreviewError} />
              {/* A gradient scrim, not a floating label: the text stays on the lifted surface and
                  never sits directly on another photo (§3's scrim rule). */}
              <div
                data-testid="drag-overlay-scrim"
                className="absolute inset-x-0 bottom-0 bg-linear-to-t from-aura-bg/85 via-aura-bg/75 to-transparent px-2 pt-7 pb-1.5"
              >
                <p className="text-xs break-words text-aura-text">{statusSentence(activeItem)}</p>
              </div>
            </div>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
