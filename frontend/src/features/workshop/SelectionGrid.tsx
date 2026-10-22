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
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

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

import type { Photo } from "../../types/api";

/**
 * The selection grid — one tile per picked photo, with its own state and its own way out (E4-S2A1),
 * and since E4-S3 the place where the dump's order is arranged by pointer, finger or keyboard.
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
 * A photo, a remove button in the corner, and (only when decoding fails) the E4-S1A scrim. A healthy
 * preview is left unobscured so the contact sheet reads as photographs rather than dark tiles.
 * `loading="lazy"` and `decoding="async"` follow the rendering rule for every image except the splash
 * hero.
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
 * are actually leaving in. Both controls come back when the request settles, and the tiles carry
 * `aria-disabled` while busy, so assistive tech hears that the grid is not movable.
 *
 * ## The keyboard path (E4-S3D)
 *
 * dnd-kit's `attributes` put the drag surface in the tab order with `role="button"`, a name that
 * states the photo's position and file, `aria-pressed` for inspector selection, and `aria-describedby`
 * pointing at its built-in instructions;
 * `KeyboardSensor` with `sortableKeyboardCoordinates` turns Space/Enter into a lift, the arrows into
 * moves to the nearest tile, Space/Enter into a drop and Escape into a cancel. Without the coordinate
 * getter the sensor moves the overlay in 25 px steps and never changes the order. E4-S3B deliberately
 * shipped no focus stop without a sensor; the two land together here.
 *
 * A pointer click also selects a tile without lifting it. The Workshop's inspector supplies explicit
 * earlier/later buttons, the single-pointer alternative to dragging; long-press touch and keyboard
 * sorting remain available.
 *
 * Announcements (`lib/ordering/announce.ts`) are built from the current array, so a reader hears
 * "Photo 2 of 6 moved to position 4." rather than generated ids. The first `over` in a drag is the
 * tile itself; the handler tracks the last announced destination and skips a repeat, so a return to
 * the origin position is announced rather than swallowed. The workshop's own `role="status"` region
 * stays silent during a drag: it narrates uploads, and a drag changes none.
 *
 * ## Reordering
 *
 * The array order is the display order (`lib/ordering/move.ts`); this component only reports a move as
 * `onMove(from, to)`. The sensors are split because the gestures are different: a mouse drag starts
 * after 8 px, a finger long-press starts after 250 ms and gives up if it travels more than 8 px — so a
 * swipe still scrolls the grid and a long press lifts the photo. `touch-action: manipulation` on the
 * activator keeps the swipe native and leaves pinch-zoom alone. `DndContext` auto-scrolls the nearest
 * scrollable ancestor with the tuned band in `AUTO_SCROLL_OPTIONS` — the document at the probed
 * 390 × 300 viewport, where the grid's own scroller has no travel — so a photo can be carried to a row
 * that is not on screen (E4-S3C).
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
 * Waiting is present for assistive technology but not repeated in the visible contact sheet. Upload,
 * success and per-file failure remain visible in a solid photo scrim; they are ordinary text, not live
 * regions, because the Workshop mounts one persistent status region for announcements. `data-state` on
 * the list item carries the state for tests and DOM inspection; `data-photo-id`, present only once the
 * tile is `added`, carries the archive photo's id — the value the publish will read.
 */

/**
 * Where one selected file is in the queue. A success keeps its tile as `added` (E4-S5A) — the draft
 * the publish will read — so the only way a tile leaves is the curator's own remove.
 */
export type ItemState = "waiting" | "uploading" | "error" | "added";

/** One tile: the File, its preview URL, and what the screen knows about it. */
export interface SelectionItem {
  readonly id: string;
  /** The picked file. The tile preview always comes from this object, never from the re-encode. */
  readonly file: File;
  /**
   * The archive's photo once this tile's upload succeeded (E4-S5A); `null` until then. It is what the
   * publish reads — six of these, in display order — and why the tile stays after a success.
   */
  readonly photo: Photo | null;
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
  /** The photo selected for the inspector and pointer-based ordering controls. */
  readonly selectedId: string | null;
  /** True while an upload is running: removal and dragging wait for the request to settle. */
  readonly busy: boolean;
  readonly onMove: (from: number, to: number) => void;
  readonly onSelect: (id: string) => void;
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
    case "added":
      return "Added";
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

/** The artwork layer shared by the tile and its drag overlay: the photo, or a quiet failed-preview scrim. */
function TileFace({
  item,
  onPreviewError,
}: {
  readonly item: SelectionItem;
  readonly onPreviewError: (id: string) => void;
}) {
  return (
    <>
      {item.previewBroken ? (
        <div
          data-testid="tile-scrim"
          aria-hidden="true"
          className="absolute inset-0 bg-aura-bg/70"
        />
      ) : (
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
  selected,
  busy,
  reducedMotion,
  onSelect,
  onRemove,
  onPreviewError,
}: {
  readonly item: SelectionItem;
  readonly position: number;
  readonly total: number;
  readonly selected: boolean;
  readonly busy: boolean;
  readonly reducedMotion: boolean;
  readonly onSelect: (id: string) => void;
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
      data-photo-id={item.photo?.id}
      data-dragging={isDragging ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      // The slot stays measured while its photo is in the overlay; only the paint is hidden.
      className={`min-w-0 ${isDragging ? "opacity-0" : ""}`}
    >
      <div
        data-slot={String(position).padStart(2, "0")}
        className={`aether-slot relative aspect-[4/3] overflow-hidden rounded-[2px] ${
          selected ? "ring-1 ring-inset ring-aura-accent" : ""
        }`}
      >
        {/* The drag surface — a sibling of the remove button, and the tile's keyboard affordance
            since E4-S3D: the attributes put it in the tab order and dnd-kit's sensor listens. */}
        <div
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={tileLabel(item, position, total)}
          aria-pressed={selected}
          data-testid="drag-activator"
          onClick={() => {
            if (!busy) {
              onSelect(item.id);
            }
          }}
          // `touch-action: manipulation` leaves vertical panning and pinch-zoom to the browser, so a
          // short swipe scrolls the grid instead of lifting the tile (measured in the Chromium probe).
          className="absolute inset-0 touch-manipulation rounded-[2px] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/70 [@media(pointer:fine)]:cursor-grab [@media(pointer:fine)]:active:cursor-grabbing"
        >
          <TileFace item={item} onPreviewError={onPreviewError} />
        </div>

        <button
          type="button"
          aria-label={removeLabel(item)}
          disabled={busy}
          onClick={() => onRemove(item.id)}
          className="absolute top-1 right-1 z-10 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition-colors duration-[var(--motion-duration-quick)] active:bg-aura-bg/20 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/70 disabled:cursor-default disabled:opacity-40"
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

        {item.state === "waiting" ? (
          <p className="sr-only">
            <span>{item.file.name === "" ? "Photo" : item.file.name}: </span>
            {statusSentence(item)}
          </p>
        ) : (
          <p className="absolute inset-x-0 bottom-0 bg-aura-bg/80 px-2 py-2 text-xs break-words text-aura-text">
            <span className="sr-only">{item.file.name === "" ? "Photo" : item.file.name}: </span>
            {statusSentence(item)}
          </p>
        )}
      </div>
    </li>
  );
}

/** The grid: a list for assistive tech, and one focal point — the photos. */
export function SelectionGrid({
  items,
  selectedId,
  busy,
  onMove,
  onSelect,
  onRemove,
  onPreviewError,
}: SelectionGridProps) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const reducedMotion = useReducedMotion();
  // The last destination a move sentence named, so the pickup frame's self-`over` is skipped without
  // also swallowing a genuine return to the origin position (initialised at pickup).
  const lastAnnounced = useRef<number | null>(null);

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
   * The announcements are built from the current array so they speak positions rather than ids.
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
        lastAnnounced.current = position;
        return position === null ? undefined : pickupAnnouncement(position, items.length);
      },
      onDragOver({ active, over }) {
        const position = positionOf(active.id);
        const destination = positionOf(over?.id);
        if (position === null || destination === null || destination === lastAnnounced.current) {
          return undefined;
        }
        lastAnnounced.current = destination;
        return moveAnnouncement(position, items.length, destination);
      },
      onDragEnd({ active, over }) {
        lastAnnounced.current = null;
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
        lastAnnounced.current = null;
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
        <ul
          role="list"
          aria-label="Selected photos"
          className="grid grid-cols-2 items-start gap-3 sm:grid-cols-3 sm:gap-4"
        >
          {items.map((item, index) => (
            <SortableTile
              key={item.id}
              item={item}
              position={index + 1}
              total={items.length}
              selected={item.id === selectedId}
              busy={busy}
              reducedMotion={reducedMotion}
              onSelect={onSelect}
              onRemove={onRemove}
              onPreviewError={onPreviewError}
            />
          ))}
        </ul>
      </SortableContext>

      {/* A clone, not a second sortable: calling `useSortable` here would register a duplicate id.
          `aria-hidden` because the live region, not a second reading of the tile, is the announcement.
          The status line sits inside the lifted square on its own scrim: see the header. */}
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
            <div className="relative aspect-[4/3] w-full scale-[1.03] overflow-hidden rounded-[2px] shadow-[0_8px_24px_rgba(0,0,0,0.24)] outline outline-1 -outline-offset-1 outline-aura-text/20">
              <TileFace item={activeItem} onPreviewError={onPreviewError} />
              {/* A solid photo scrim, not a floating label: text stays on the lifted surface and
                  never sits directly on another photo (§3's scrim rule). */}
              <div
                data-testid="drag-overlay-scrim"
                className="absolute inset-x-0 bottom-0 bg-aura-bg/80 px-2 pt-3 pb-1.5"
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
