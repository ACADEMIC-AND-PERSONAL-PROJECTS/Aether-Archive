import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useMemo, useState, type CSSProperties } from "react";

import { prefersReducedMotion } from "../../lib/motion/reduced";
import { EASE_SOFT } from "../../lib/motion/tokens";
import {
  cancelAnnouncement,
  dropAnnouncement,
  moveAnnouncement,
  pickupAnnouncement,
  SCREEN_READER_INSTRUCTIONS,
} from "../../lib/ordering/announce";
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
 * and since E4-S3 the place where the dump's order is arranged.
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
 * While an upload is in flight, the remove button is disabled rather than removed: the request holds a
 * snapshot of the file, and letting the tile vanish mid-flight would leave the screen describing
 * something the user can no longer see. **Dragging is disabled for the same reason** and is the E4-S3
 * decision the story asked for: the queue reads the array once when it starts, so a reorder mid-batch
 * would make the grid disagree with the order the requests are actually leaving in. Both controls come
 * back when the request settles. The tiles keep their `aria-disabled` state while busy, so assistive
 * tech hears that the grid is not movable rather than merely finding the keys inert.
 *
 * ## Reordering
 *
 * The array order is the display order (`lib/ordering/move.ts`); this component only reports a move as
 * `onMove(from, to)`. The sensors are split because the gestures are different: a mouse drag starts
 * after 8 px, a finger long-press starts after 250 ms and gives up if it travels more than 8 px — so a
 * swipe still scrolls the grid and a long press lifts the photo. `touch-action: manipulation` on the
 * activator keeps the swipe native and leaves pinch-zoom alone. `DndContext` owns auto-scroll at the
 * `overflow-y-auto` ancestor, and the `DragOverlay` carries a clone of the tile with the project's
 * one soft shadow and a hairline edge; the drop animation is 250 ms on the shared ease, under the
 * story's 300 ms ceiling.
 *
 * The keyboard path is dnd-kit's sortable one: Tab reaches a tile, Space or Enter picks it up, the
 * arrow keys move it to the nearest tile, Space or Enter drops, Escape cancels. Announcements use
 * `lib/ordering/announce.ts`, so a screen reader hears "Photo 2 of 6 moved to position 4." instead of
 * generated ids. `sortableKeyboardCoordinates` is what turns an arrow key into a neighbouring slot;
 * without it the keyboard sensor moves the overlay in 25 px steps and never changes the order.
 *
 * **Reduced motion.** The global stylesheet freezes CSS animations, but the settle is an inline
 * transition and the drop is a Web Animations API animation, so neither is covered. The grid reads
 * `prefers-reduced-motion` itself (`lib/motion/reduced.ts`): the settle is `null` and the overlay has
 * no drop animation when it is set. The direct manipulation — the tile under the pointer — stays, as
 * it is the drag itself rather than decorative motion.
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

/**
 * The tile's keyboard name. The position comes first because a move changes it and the announcement
 * then has something to refer to; the file name follows so six tiles are still distinguishable.
 */
function tileLabel(item: SelectionItem, position: number, total: number): string {
  return item.file.name === ""
    ? `Photo ${position} of ${total}`
    : `Photo ${position} of ${total}: ${item.file.name}`;
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
  position,
  total,
  busy,
  reducedMotion,
  onRemove,
  onPreviewError,
}: {
  readonly item: SelectionItem;
  readonly position: number;
  readonly total: number;
  readonly busy: boolean;
  readonly reducedMotion: boolean;
  readonly onRemove: (id: string) => void;
  readonly onPreviewError: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
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
        {/* The drag surface. Deliberately a sibling of the remove button: see the header. */}
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={tileLabel(item, position, total)}
          className="absolute inset-0 touch-manipulation rounded-[14px] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/50 [@media(pointer:fine)]:cursor-grab [@media(pointer:fine)]:active:cursor-grabbing"
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
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /*
   * The announcements are built from the current array so they can speak positions rather than ids.
   * `positionOf` is 1-based; `null` stands for "no such tile" (an over that resolved to nothing).
   */
  const announcements = useMemo<Announcements>(() => {
    const positionOf = (id: UniqueIdentifier | null | undefined): number | null => {
      if (id === null || id === undefined) {
        return null;
      }
      const index = items.findIndex((item) => item.id === id);
      return index === -1 ? null : index + 1;
    };

    return {
      onDragStart({ active }) {
        const position = positionOf(active.id);
        return position === null ? undefined : pickupAnnouncement(position, items.length);
      },
      onDragOver({ active, over }) {
        const position = positionOf(active.id);
        const destination = positionOf(over?.id);
        return position === null || destination === null
          ? undefined
          : moveAnnouncement(position, items.length, destination);
      },
      onDragEnd({ active, over }) {
        const position = positionOf(active.id);
        if (position === null) {
          return undefined;
        }
        const destination = positionOf(over?.id);
        return destination === null
          ? cancelAnnouncement(position, items.length)
          : dropAnnouncement(destination, items.length);
      },
      onDragCancel({ active }) {
        const position = positionOf(active.id);
        return position === null ? undefined : cancelAnnouncement(position, items.length);
      },
    };
  }, [items]);

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
      accessibility={{
        announcements,
        screenReaderInstructions: { draggable: SCREEN_READER_INSTRUCTIONS },
      }}
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
          {items.map((item, index) => (
            <SortableTile
              key={item.id}
              item={item}
              position={index + 1}
              total={items.length}
              busy={busy}
              reducedMotion={reducedMotion}
              onRemove={onRemove}
              onPreviewError={onPreviewError}
            />
          ))}
        </ul>
      </SortableContext>

      {/* A clone, not a second sortable: calling `useSortable` here would register a duplicate id.
          `aria-hidden` because the live region, not a second reading of the tile, is the announcement. */}
      <DragOverlay
        dropAnimation={reducedMotion ? null : { duration: DROP_ANIMATION_MS, easing: EASE_SOFT }}
      >
        {activeItem === null ? null : (
          <div
            aria-hidden="true"
            data-testid="drag-overlay"
            className="flex h-full w-full flex-col"
          >
            <div className="relative aspect-square w-full scale-[1.03] overflow-hidden rounded-[14px] shadow-[0_8px_24px_rgba(0,0,0,0.24)] outline outline-1 -outline-offset-1 outline-aura-text/20">
              <TileFace item={activeItem} onPreviewError={onPreviewError} />
            </div>
            <p className="mt-1 text-xs break-words text-aura-text">{statusSentence(activeItem)}</p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
