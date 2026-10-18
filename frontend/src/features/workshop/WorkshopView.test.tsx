import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkshopView } from "./WorkshopView";
import { FakeXhr } from "../../api/__fixtures__/fakeXhr";
import { PROBLEM_413_TOO_LARGE, PROBLEM_415_UNSUPPORTED } from "../../api/__fixtures__/problems";
import { queryKeys } from "../../api/queryKeys";
import { createQueryClient } from "../../app/queryClient";
import { AURA_STORAGE_KEY } from "../../hooks/useAura";
import { suggestPalette } from "../../lib/color/suggest";
import { downscaleForUpload } from "../../lib/upload/downscale";
import { MAX_SELECTION } from "../../lib/upload/selection";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES } from "../../lib/upload/validation";
import { runAxe, violationSummary } from "../../test/axe";

import type { PaletteColor } from "../../lib/color/types";
import type { Photo } from "../../types/api";

/**
 * The browser edge is not available in jsdom (no `createImageBitmap`, no canvas — ADR-018), so the
 * component tests replace exactly that one export with a controllable function. The planner and the
 * real decode/draw/encode path keep their own tests (`lib/upload/downscale.test.ts` and the Chromium
 * probe); these tests pin what the queue does with whatever the edge returns.
 */
vi.mock("../../lib/upload/downscale", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    downscaleForUpload: vi.fn(async (file: File) => file),
  };
});

const mockedDownscale = vi.mocked(downscaleForUpload);

/**
 * The aura's browser edge (E4-S4C) gets the same treatment: `suggestPalette` needs
 * `createImageBitmap`, so these tests replace exactly it and pin what the picker does with whatever
 * ranking it returns. The real pipeline keeps its own tests (`lib/color/suggest.test.ts`) and the
 * Chromium probe.
 */
vi.mock("../../lib/color/suggest", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    suggestPalette: vi.fn(async () => []),
  };
});

const mockedSuggest = vi.mocked(suggestPalette);

/**
 * The workshop's multi-select and sequential-queue behaviour (E4-S2A2; the draft survives its upload,
 * E4-S5A), as the user observes it.
 *
 * The transport's browser edge is the fake from `api/__fixtures__/fakeXhr.ts`; everything above it is the
 * shipped component, the real mutation hook and a real `QueryClient`. The tests pin this slice's criteria
 * — the cap and its explanation, a tile per file with a real remove button, one request at a time in
 * selection order, per-file failure isolation, retry identity, batch cancellation and its reset — plus
 * the picker and announcement contracts E4-S1A/S1B/E3-S5B/A1 established, E4-S3B's gestures (the two
 * activation thresholds, the overlay, the reorder callback and the disabled state while uploading),
 * E4-S3C's motion slice (the auto-scroll tuning, the tuned drop animation and the reduced-motion
 * reading), and E4-S3D's keyboard path (the sortable attributes, keyboard reorder, Escape cancel and
 * the two live regions).
 *
 * Object URLs are stubbed with a counter so a test can name the URL a tile owns; the shipped code still
 * calls the real `URL.createObjectURL`/`revokeObjectURL` shape (jsdom implements both, measured in the
 * test-environment table in `frontend/README.md`).
 *
 * The late-progress guard has a second, observable half and an unobservable one. The observable half —
 * a settled request must not move the next file's line — is pinned here; the unmount half is a pure
 * predicate (`lib/upload/progress.ts`) and React 19 makes a `setState` on an unmounted tree a silent
 * no-op, so there is nothing left in the DOM to assert (measured: no warning, no paint).
 *
 * jsdom limitation, stated rather than papered over: the file input has no native picker. The suite
 * assigns `files` on the input and fires a real `change` event (the working pattern, probed in this
 * environment: `Object.defineProperty(input, "files", …)` succeeds, while `DataTransfer` does not exist
 * in jsdom 30). The browser-level picker and the real queue are exercised by the Chromium probe.
 */

const UPLOADED: Photo = {
  id: "9f1c0a3e-6a58-4b0e-9c5a-1f3d7a2b4c6d",
  url: "/images/9f1c0a3e-6a58-4b0e-9c5a-1f3d7a2b4c6d.png",
  category: "uncategorized",
  uploadedAt: "2026-10-17T03:46:21.684975Z",
};

let previewCount = 0;

/** A file with its `File`-native size overridden, so a 15 MB boundary does not allocate 15 MB. */
function fileOf(size: number, type = "image/png", name = "photo.png"): File {
  const payload = new Uint8Array(Math.min(size, 8));
  const file = new File([payload], name, { type });
  if (size > payload.byteLength) {
    Object.defineProperty(file, "size", { configurable: true, value: size });
  }
  return file;
}

/** The jsdom pattern for a native pick: define the FileList, then fire the change React listens for. */
function pickFiles(input: HTMLElement, files: readonly File[]): void {
  Object.defineProperty(input, "files", { configurable: true, value: files });
  fireEvent.change(input);
}

/** A short grid of three named files, for the keyboard tests that do not need six. */
function threeFiles(): readonly File[] {
  return ["a", "b", "c"].map((name) => fileOf(16, "image/png", `${name}.png`));
}

/** The full six-photo grid the keyboard announcements count against. */
function sixFiles(): readonly File[] {
  return ["a", "b", "c", "d", "e", "f"].map((name) => fileOf(16, "image/png", `${name}.png`));
}

/** One ranked suggestion, in the shape the extraction edge returns (the picker reads hex + weight). */
function suggestion(hex: string, weight: number): PaletteColor {
  return { hex, oklch: { l: 0.5, c: 0.05, h: 200 }, weight };
}

function renderWorkshop(): { client: QueryClient; unmount: () => void } {
  const client = createQueryClient();
  const { unmount } = render(
    <QueryClientProvider client={client}>
      <WorkshopView />
    </QueryClientProvider>,
  );
  return { client, unmount };
}

/** The request at `index`, awaited until the queue has opened it. */
async function requestAt(index: number): Promise<FakeXhr> {
  await waitFor(() => expect(FakeXhr.instances.length).toBeGreaterThan(index));
  const request = FakeXhr.instances[index];
  if (request === undefined) {
    throw new Error(`request ${index} opened no XHR`);
  }
  return request;
}

async function respond(
  request: FakeXhr,
  status: number,
  body: unknown,
  contentType = "application/json",
): Promise<void> {
  await act(async () => {
    request.respond(status, body, contentType);
  });
}

async function startUpload(): Promise<FakeXhr> {
  const before = FakeXhr.instances.length;
  fireEvent.click(screen.getByRole("button", { name: "Upload" }));
  return requestAt(before);
}

function multipartBody(request: FakeXhr): FormData {
  if (!(request.body instanceof FormData)) {
    throw new Error("the upload request has no multipart body");
  }
  return request.body;
}

/** The list item that owns a file, found through the remove button's accessible name. */
function tileFor(name: string): HTMLElement {
  const button = screen.getByRole("button", { name: `Remove ${name}` });
  const tile = button.closest("li");
  if (tile === null) {
    throw new Error(`no tile for ${name}`);
  }
  return tile;
}

function selectedTiles(): readonly HTMLElement[] {
  return within(screen.getByRole("list", { name: "Selected photos" })).getAllByRole("listitem");
}

/** The drag surfaces, in display order. Since E4-S3D they are the tile's keyboard affordance too. */
function dragActivators(): readonly HTMLElement[] {
  return screen.getAllByTestId("drag-activator");
}

/**
 * dnd-kit's live region, told apart from the workshop's by `aria-atomic`: dnd-kit sets it, the
 * workshop's persistent status region does not. Both are `role="status"`, and during a drag only this
 * one changes — which is the contract the keyboard tests pin.
 */
function dragAnnouncement(): HTMLElement {
  const region = screen
    .getAllByRole("status")
    .find((node) => node.getAttribute("aria-atomic") === "true");
  if (region === undefined) {
    throw new Error("dnd-kit mounted no live region");
  }
  return region;
}

/** The drag surface inside a named tile, found through the tile's remove button. */
function activatorFor(name: string): HTMLElement {
  const activator = tileFor(name).querySelector<HTMLElement>('[data-testid="drag-activator"]');
  if (activator === null) {
    throw new Error(`no drag activator for ${name}`);
  }
  return activator;
}

/** A keyboard press, then the event-loop turn dnd-kit's keyboard sensor needs to attach its listener. */
async function pressKey(target: Element | Document, code: string, key: string): Promise<void> {
  fireEvent.keyDown(target, { code, key });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The visible order, as each tile's state line reads it ("a.png: Waiting"). */
function tileLines(): readonly (string | null)[] {
  return selectedTiles().map((tile) => tile.textContent);
}

/**
 * jsdom has no layout: every rect is 0×0, so `closestCenter` would see every tile stacked at the
 * origin and no pointer position could resolve to a destination. Give each tile the three-column
 * 120 px pitch a phone supplies — on the droppable (the `<li>`) and on the activator dnd-kit measures
 * the lifted node from. The Chromium probe repeats the same gesture against real layout.
 */
function stubGridRects(): void {
  const rectAt = (index: number): DOMRect => {
    const left = (index % 3) * 120;
    const top = Math.floor(index / 3) * 120;
    return {
      x: left,
      y: top,
      width: 112,
      height: 112,
      top,
      left,
      right: left + 112,
      bottom: top + 112,
      toJSON: () => ({}),
    } as DOMRect;
  };
  selectedTiles().forEach((tile, index) => {
    tile.getBoundingClientRect = () => rectAt(index);
  });
  dragActivators().forEach((activator, index) => {
    activator.getBoundingClientRect = () => rectAt(index);
  });
}

/**
 * dnd-kit removes its capture-phase document listeners on a **50 ms timer** after a drag detaches —
 * they exist to swallow the click that follows a drag. A test that activated a drag and returned
 * before that timer fired left the listener on the shared jsdom document, and it swallowed the next
 * test's first click: the flake PR #124's review measured. Every activated drag below ends with a
 * drop or a cancel and then waits here, past the timer, before the test returns.
 */
async function settleDragListeners(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

beforeEach(() => {
  FakeXhr.reset();
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  previewCount = 0;
  // Deterministic preview URLs: the first picked file owns `blob:preview-1`, in pick order.
  vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
    previewCount += 1;
    return `blob:preview-${previewCount}`;
  });
  // The default is the library's own ineligible/within-bounds answer: send the picked File as-is.
  mockedDownscale.mockReset();
  mockedDownscale.mockImplementation(async (file: File) => file);
  // The aura: no suggestions unless a test arranges them, and no session outlives its test.
  mockedSuggest.mockReset();
  mockedSuggest.mockImplementation(async () => []);
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the picker", () => {
  it("should accept images only, offer multi-select and start idle", () => {
    renderWorkshop();

    expect(screen.getByText("Add photos to your archive.")).toBeVisible();
    const input = screen.getByLabelText("Choose photos");
    expect(input).toHaveAttribute("accept", ACCEPT_ATTRIBUTE);
    expect(input).toHaveAttribute("multiple");
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("");
    // No request exists before a file is chosen, and the idle screen has no action yet.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should refuse a non-image before any request and name the file", () => {
    renderWorkshop();

    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "text/plain", "notes.png")]);

    const notice = screen.getByTestId("workshop-notice");
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent("notes.png:");
    expect(notice).toHaveTextContent("isn't an image the archive can keep");
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(FakeXhr.instances).toHaveLength(0);
    expect(screen.getByTestId("workshop-status")).toHaveTextContent(notice.textContent ?? "");
  });

  it("should refuse an oversize file, and accept the limit exactly", () => {
    renderWorkshop();

    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(MAX_UPLOAD_BYTES + 1)]);
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("larger than 15 MB");
    expect(FakeXhr.instances).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(MAX_UPLOAD_BYTES)]);
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(screen.getByRole("button", { name: "Upload" })).toBeVisible();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should keep six of seven picked photos and explain the one that was left out", () => {
    renderWorkshop();
    const seven = Array.from({ length: 7 }, (_, index) =>
      fileOf(16, "image/png", `photo-${index}.png`),
    );

    pickFiles(screen.getByLabelText("Choose photos"), seven);

    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(selectedTiles()).toHaveLength(MAX_SELECTION);
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent(
      "You can add up to 6 photos at a time — 1 wasn't added.",
    );
    expect(screen.getByTestId("workshop-status")).toHaveTextContent(
      "You can add up to 6 photos at a time — 1 wasn't added.",
    );
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should count the existing selection against the cap when adding more", () => {
    renderWorkshop();
    pickFiles(
      screen.getByLabelText("Choose photos"),
      Array.from({ length: 5 }, (_, index) => fileOf(16, "image/png", `first-${index}.png`)),
    );
    expect(selectedTiles()).toHaveLength(5);

    pickFiles(screen.getByLabelText("Add photos"), [
      fileOf(16, "image/png", "sixth.png"),
      fileOf(16, "image/png", "seventh.png"),
    ]);

    expect(selectedTiles()).toHaveLength(6);
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("1 wasn't added");
    expect(screen.getByRole("button", { name: "Remove sixth.png" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Remove seventh.png" })).toBeNull();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should report every refused file by name and keep the valid ones", () => {
    renderWorkshop();

    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "text/plain", "notes.txt"),
      fileOf(0, "image/png", "empty.png"),
      fileOf(16, "image/png", "good.png"),
    ]);

    const notice = screen.getByTestId("workshop-notice");
    expect(notice).toHaveTextContent("notes.txt:");
    expect(notice).toHaveTextContent("empty.png: That file is empty.");
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(selectedTiles()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remove good.png" })).toBeVisible();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should keep the current selection when a later pick is refused", () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "kept.png")]);

    pickFiles(screen.getByLabelText("Add photos"), [fileOf(16, "text/plain", "notes.txt")]);

    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(screen.getByRole("button", { name: "Remove kept.png" })).toBeVisible();
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("notes.txt:");
  });

  it("should clear the previous refusal when a valid pick follows", () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "text/plain", "notes.txt")]);
    expect(screen.getByTestId("workshop-notice")).toBeVisible();

    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "good.png")]);

    const notice = screen.getByTestId("workshop-notice");
    expect(notice).toHaveTextContent("1 photo selected.");
    expect(notice).not.toHaveTextContent("notes.txt");
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("1 photo selected.");
  });

  it("should load every preview lazily and decode it off the main thread", () => {
    renderWorkshop();

    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(2048, "image/png", "a.png"),
      fileOf(2048, "image/png", "b.png"),
    ]);

    const previews = Array.from(document.querySelectorAll("main img"));
    expect(previews).toHaveLength(2);
    for (const preview of previews) {
      expect(preview).toHaveAttribute("loading", "lazy");
      expect(preview).toHaveAttribute("decoding", "async");
    }
  });

  it("should drop a preview the browser cannot decode, keeping the tile and its scrim", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(64, "image/png", "decoy.png")]);
    const preview = document.querySelector("main img");
    if (!(preview instanceof HTMLImageElement)) {
      throw new Error("the picked file has no preview");
    }

    fireEvent.error(preview);

    await waitFor(() => expect(document.querySelector("main img")).toBeNull());
    // The broken glyph is gone, but the tile and the file are not: the server still judges the bytes.
    const tile = tileFor("decoy.png");
    expect(tile).toBeVisible();
    expect(within(tile).getByTestId("tile-scrim")).toBeInTheDocument();
    expect(tile).toHaveAttribute("data-state", "waiting");
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(screen.getByRole("button", { name: "Remove decoy.png" })).toBeVisible();
  });
});

describe("the grid", () => {
  it("should list every file with a named remove button, and removing releases its preview", () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
      fileOf(16, "image/png", "c.png"),
    ]);

    const list = screen.getByRole("list", { name: "Selected photos" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(3);
    const removeB = screen.getByRole("button", { name: "Remove b.png" });
    expect(removeB).toHaveClass("h-11", "w-11");
    // The file's name is the tile's accessible prefix, so six "Waiting" lines never become anonymous.
    expect(tileFor("a.png")).toHaveAttribute("data-state", "waiting");
    expect(tileFor("a.png")).toHaveTextContent("a.png: Waiting");
    // One message, two roles: the panel's count sentence and the persistent status region.
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("3 photos selected.");
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("3 photos selected.");

    fireEvent.click(removeB);

    expect(revoke).toHaveBeenCalledWith("blob:preview-2");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("2 photos selected.");
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("2 photos selected.");
    expect(screen.queryByRole("button", { name: "Remove b.png" })).toBeNull();
  });

  it("should return to the picker and focus it when the last tile is removed", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "only.png")]);

    fireEvent.click(screen.getByRole("button", { name: "Remove only.png" }));

    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(screen.queryByRole("list", { name: "Selected photos" })).toBeNull();
    await waitFor(() => expect(screen.getByLabelText("Choose photos")).toHaveFocus());
  });

  it("should show the per-file state under each tile", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);

    expect(tileFor("a.png")).toHaveAttribute("data-state", "waiting");
    expect(tileFor("a.png")).toHaveTextContent("Waiting");
    expect(tileFor("b.png")).toHaveTextContent("Waiting");

    const first = await startUpload();
    await waitFor(() => expect(tileFor("a.png")).toHaveAttribute("data-state", "uploading"));
    expect(tileFor("a.png")).toHaveTextContent("Uploading");
    expect(tileFor("b.png")).toHaveAttribute("data-state", "waiting");

    await respond(first, 413, PROBLEM_413_TOO_LARGE, "application/problem+json");
    await waitFor(() => expect(tileFor("a.png")).toHaveAttribute("data-state", "error"));
    expect(tileFor("a.png")).toHaveTextContent("That photo is larger than the archive accepts.");
  });

  it("should keep a usable name when a file has none", () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      new File([new Uint8Array(4)], "", { type: "image/png" }),
    ]);

    expect(screen.getByRole("button", { name: "Remove photo" })).toBeVisible();
    expect(screen.getByRole("listitem")).toHaveTextContent("Photo: Waiting");
  });
});

describe("reordering", () => {
  it("should start a mouse drag only after 8 px of travel", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();

    const first = dragActivators()[0];
    if (first === undefined) {
      throw new Error("the first tile has no drag activator");
    }
    fireEvent.mouseDown(first, { clientX: 56, clientY: 56, button: 0 });
    fireEvent.mouseMove(document, { clientX: 60, clientY: 56 });
    await act(async () => {});
    // A click (or a 4 px wobble) is not a drag: the tile stays in the grid.
    expect(document.querySelector('[data-dragging="true"]')).toBeNull();
    expect(screen.queryByTestId("drag-overlay")).toBeNull();

    fireEvent.mouseMove(document, { clientX: 66, clientY: 56 });
    await act(async () => {});
    expect(tileFor("a.png")).toHaveAttribute("data-dragging", "true");
    expect(screen.getByTestId("drag-overlay")).toBeVisible();
    // The lifted clone carries its own scrim so its state line never sits on a raw photo.
    expect(screen.getByTestId("drag-overlay-scrim")).toBeInTheDocument();

    fireEvent.mouseUp(document, { clientX: 66, clientY: 56 });
    await settleDragListeners();
    // The overlay is the drag, not a permanent clone: it is gone once the pointer is released.
    expect(screen.queryByTestId("drag-overlay")).toBeNull();
    expect(document.querySelector('[data-dragging="true"]')).toBeNull();
  });

  it("should reorder the selection when a drag ends on another tile", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
      fileOf(16, "image/png", "c.png"),
    ]);
    stubGridRects();

    const first = dragActivators()[0];
    if (first === undefined) {
      throw new Error("the first tile has no drag activator");
    }
    // Tile 1's centre to tile 3's centre in the stubbed 120 px pitch: (56, 56) → (296, 56).
    fireEvent.mouseDown(first, { clientX: 56, clientY: 56, button: 0 });
    fireEvent.mouseMove(document, { clientX: 66, clientY: 56 });
    await act(async () => {});
    fireEvent.mouseMove(document, { clientX: 296, clientY: 56 });
    await act(async () => {});
    fireEvent.mouseUp(document, { clientX: 296, clientY: 56 });
    await act(async () => {});

    // The array is the order: dropping through the grid's callback moved `a.png` to the third slot.
    expect(tileLines()).toEqual(["b.png: Waiting", "c.png: Waiting", "a.png: Waiting"]);
    await settleDragListeners();
  });

  it("should lift on a long press and leave a short swipe to the browser", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();

    const first = dragActivators()[0];
    if (first === undefined) {
      throw new Error("the first tile has no drag activator");
    }
    fireEvent.touchStart(first, { touches: [{ clientX: 56, clientY: 56 }] });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 270));
    });
    expect(tileFor("a.png")).toHaveAttribute("data-dragging", "true");
    expect(screen.getByTestId("drag-overlay")).toBeVisible();
    fireEvent.touchEnd(first, { touches: [] });
    await settleDragListeners();
    expect(screen.queryByTestId("drag-overlay")).toBeNull();

    // A swipe that travels past the 8 px tolerance before the 250 ms elapses cancels the pending drag,
    // which is what lets the same touch scroll the grid instead of lifting a tile. `touch-manipulation`
    // on the activator is what keeps panning native for the browser in the first place.
    fireEvent.touchStart(first, { touches: [{ clientX: 56, clientY: 56 }] });
    fireEvent.touchMove(first, { touches: [{ clientX: 56, clientY: 76 }] });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 270));
    });
    expect(document.querySelector('[data-dragging="true"]')).toBeNull();
    expect(screen.queryByTestId("drag-overlay")).toBeNull();
    fireEvent.touchEnd(first, { touches: [] });
    await settleDragListeners();
  });

  it("should keep a pointer on the remove control out of the sensors, and its click working", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();

    const remove = screen.getByRole("button", { name: "Remove a.png" });
    fireEvent.touchStart(remove, { touches: [{ clientX: 0, clientY: 0 }] });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    // The button is a sibling of the activator, so the gesture never reaches a sensor.
    expect(document.querySelector('[data-dragging="true"]')).toBeNull();
    expect(screen.queryByTestId("drag-overlay")).toBeNull();
    fireEvent.touchEnd(remove, { touches: [] });
    await settleDragListeners();

    // …and the click path it was built for still removes the tile.
    fireEvent.click(remove);
    expect(screen.queryByRole("button", { name: "Remove a.png" })).toBeNull();
    expect(selectedTiles()).toHaveLength(1);
  });

  it("should expose each tile as a named sortable with its position", () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), threeFiles());

    // E4-S3D adds the KeyboardSensor and dnd-kit's attributes together: the activator is now a real
    // focus stop with a role and a name, not the dead tab stop E4-S3B deliberately avoided.
    const first = screen.getByRole("button", { name: "Photo 1 of 3: a.png" });
    expect(first).toHaveAttribute("aria-roledescription", "sortable");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(first).toHaveClass("touch-manipulation");
    expect(screen.getByRole("button", { name: "Photo 3 of 3: c.png" })).toBeVisible();

    // The instructions the tile points at are ours, not dnd-kit's default: they name the arrow keys.
    const instructions = first.getAttribute("aria-describedby");
    expect(instructions).not.toBeNull();
    expect(document.getElementById(instructions ?? "")).toHaveTextContent(
      "To move a photo, press Space or Enter to pick it up.",
    );

    // The remove control is a sibling of the drag surface, so a pointer-down on it reaches no sensor.
    const remove = screen.getByRole("button", { name: "Remove a.png" });
    expect(first.contains(remove)).toBe(false);
    expect(remove.contains(first)).toBe(false);
  });

  it("should move a tile down with the keyboard and announce both positions", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), sixFiles());
    stubGridRects();

    // Three persistent regions, each owning one conversation: the workshop's says what the queue
    // is doing, dnd-kit's says where the photo is, and the picker's speaks its verdict — kept
    // mounted and empty between messages (E3-S5B). A drag changes no upload state, so only one speaks.
    expect(screen.getAllByRole("status")).toHaveLength(3);
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("6 photos selected.");

    const first = activatorFor("a.png");
    first.focus();
    expect(first).toHaveFocus();

    await pressKey(first, "Space", " ");
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("drag-overlay")).toBeVisible();
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("6 photos selected.");

    // The first `over` in a keyboard drag is the tile itself; the pick-up sentence survives it.
    expect(dragAnnouncement()).toHaveTextContent("Photo 1 of 6 picked up.");
    expect(dragAnnouncement().textContent).not.toContain("selection-");

    // The stubbed three-column pitch puts `d` directly under `a`; the announcement names positions
    // from the current array, never dnd-kit's generated ids.
    await pressKey(document, "ArrowDown", "ArrowDown");
    expect(dragAnnouncement()).toHaveTextContent("Photo 1 of 6 moved to position 4.");
    expect(dragAnnouncement().textContent).not.toContain("selection-");
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("6 photos selected.");
    await pressKey(document, "Space", " ");
    expect(dragAnnouncement()).toHaveTextContent("Photo 4 of 6 dropped.");
    expect(tileLines()).toEqual([
      "b.png: Waiting",
      "c.png: Waiting",
      "d.png: Waiting",
      "a.png: Waiting",
      "e.png: Waiting",
      "f.png: Waiting",
    ]);
    expect(screen.queryByTestId("drag-overlay")).toBeNull();
    await settleDragListeners();
  });

  it("should move a tile up with the keyboard and announce both positions", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), sixFiles());
    stubGridRects();

    const fourth = activatorFor("d.png");
    fourth.focus();
    await pressKey(fourth, "Space", " ");

    await pressKey(document, "ArrowUp", "ArrowUp");
    expect(dragAnnouncement()).toHaveTextContent("Photo 4 of 6 moved to position 1.");
    await pressKey(document, "Space", " ");
    expect(dragAnnouncement()).toHaveTextContent("Photo 1 of 6 dropped.");
    expect(tileLines()).toEqual([
      "d.png: Waiting",
      "a.png: Waiting",
      "b.png: Waiting",
      "c.png: Waiting",
      "e.png: Waiting",
      "f.png: Waiting",
    ]);
    await settleDragListeners();
  });

  it("should cancel a keyboard move with Escape and keep the order", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), threeFiles());
    stubGridRects();

    const first = activatorFor("a.png");
    first.focus();
    await pressKey(first, "Space", " ");
    // Prove the drag is live before cancelling it, so a missing sensor cannot make the rest vacuous.
    expect(first).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("drag-overlay")).toBeVisible();
    await pressKey(document, "ArrowRight", "ArrowRight");
    expect(dragAnnouncement()).toHaveTextContent("Photo 1 of 3 moved to position 2.");
    await pressKey(document, "Escape", "Escape");

    expect(dragAnnouncement()).toHaveTextContent(
      "Move cancelled. Photo 1 of 3 is back in position 1.",
    );
    expect(tileLines()).toEqual(["a.png: Waiting", "b.png: Waiting", "c.png: Waiting"]);
    // dnd-kit clears its own overlay and the source slot's dragging state on cancel; the array never
    // saw the move, so the order is untouched.
    expect(screen.queryByTestId("drag-overlay")).toBeNull();
    expect(document.querySelector('[data-dragging="true"]')).toBeNull();
    expect(first).not.toHaveAttribute("aria-pressed");
    await settleDragListeners();
  });

  it("should announce a step back to the origin position after a move away", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), threeFiles());
    stubGridRects();

    const first = activatorFor("a.png");
    first.focus();
    await pressKey(first, "Space", " ");
    await pressKey(document, "ArrowRight", "ArrowRight");
    expect(dragAnnouncement()).toHaveTextContent("Photo 1 of 3 moved to position 2.");

    // The return to the pickup position is a real move, not the pickup frame's self-`over`: the
    // handler tracks the last announced destination rather than the original position.
    await pressKey(document, "ArrowLeft", "ArrowLeft");
    expect(dragAnnouncement()).toHaveTextContent("Photo 1 of 3 moved to position 1.");
    expect(dragAnnouncement().textContent).not.toContain("selection-");

    await pressKey(document, "Escape", "Escape");
    await settleDragListeners();
  });

  it("should remove the settle and the drop motion when the reader asks for reduced motion", async () => {
    // The WAAPI drop gating is NOT asserted here: jsdom's zero geometry makes dnd-kit skip the drop
    // animation altogether, so an `animate` assertion passes with or without the gate (verified with
    // a mutant). The Chromium probe is the guard — one 250 ms call with motion, zero under reduce.
    const { unmount } = renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();

    const first = dragActivators()[0];
    if (first === undefined) {
      throw new Error("the first tile has no drag activator");
    }
    fireEvent.mouseDown(first, { clientX: 56, clientY: 56, button: 0 });
    fireEvent.mouseMove(document, { clientX: 66, clientY: 56 });
    await act(async () => {});
    // Baseline: the untouched neighbour carries the 200 ms settle, and the overlay the 250 ms drop.
    expect(tileFor("b.png").style.transition).toContain("200ms");
    expect(screen.getByTestId("drag-overlay")).toHaveAttribute("data-drop-animation", "250ms");
    fireEvent.mouseUp(document, { clientX: 66, clientY: 56 });
    await settleDragListeners();
    unmount();

    // jsdom has no matchMedia; the stubbed query reports the preference the hook then reads, and the
    // listener spies pin the effect's lifecycle (subscribe on mount, unsubscribe on unmount).
    const addEventListener = vi.fn();
    const removeEventListener = vi.fn();
    const media = { matches: true, addEventListener, removeEventListener };
    const matchMedia = vi.fn().mockReturnValue(media);
    vi.stubGlobal("matchMedia", matchMedia);

    const reduced = renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();
    const reducedFirst = dragActivators()[0];
    if (reducedFirst === undefined) {
      throw new Error("the first tile has no drag activator");
    }
    fireEvent.mouseDown(reducedFirst, { clientX: 56, clientY: 56, button: 0 });
    fireEvent.mouseMove(document, { clientX: 66, clientY: 56 });
    await act(async () => {});

    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(tileFor("b.png").style.transition).toBe("");
    expect(screen.getByTestId("drag-overlay")).toHaveAttribute("data-drop-animation", "none");

    // The preference can change while the page is open: the hook re-reads it and motion returns.
    // Captured before any assertion so a failure cannot leave the drag (and its document listeners)
    // open for the next test.
    media.matches = false;
    await act(async () => {
      (addEventListener.mock.calls[0]?.[1] as () => void)();
    });
    const reEnabledDrop = screen.getByTestId("drag-overlay").getAttribute("data-drop-animation");

    // Reduced motion is not "no drag": a pointer move still reorders the grid.
    fireEvent.mouseMove(document, { clientX: 176, clientY: 56 });
    await act(async () => {});
    fireEvent.mouseUp(document, { clientX: 176, clientY: 56 });
    await act(async () => {});
    expect(tileLines()).toEqual(["b.png: Waiting", "a.png: Waiting"]);
    await settleDragListeners();
    // The update handler re-enabled the drop without a remount (the settle is not observable here:
    // dnd-kit owns the active drag's transform transition while the drag is live).
    expect(reEnabledDrop).toBe("250ms");

    // The motion-preference listener is a lifecycle addition: it must be subscribed while the grid is
    // mounted and released with it, or a long-lived page accumulates one listener per mount.
    expect(addEventListener).toHaveBeenCalledWith("change", expect.any(Function));
    reduced.unmount();
    expect(removeEventListener).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("should refuse a drag while the batch is uploading", async () => {
    const { unmount } = renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    // The queue captured the array when it started; a move now would make the grid disagree with the
    // requests already on the wire, so the sortable context and every tile are disabled.
    const request = await startUpload();
    stubGridRects();
    const first = dragActivators()[0];
    if (first === undefined) {
      throw new Error("the first tile has no drag activator");
    }
    expect(first).toHaveAttribute("aria-disabled", "true");

    fireEvent.mouseDown(first, { clientX: 56, clientY: 56, button: 0 });
    fireEvent.mouseMove(document, { clientX: 116, clientY: 56 });
    await act(async () => {});
    // The keyboard path is disabled too: the sensor has no listeners while `useSortable` is disabled.
    await pressKey(first, "Space", " ");
    await pressKey(document, "ArrowRight", "ArrowRight");

    expect(document.querySelector('[data-dragging="true"]')).toBeNull();
    expect(screen.queryByTestId("drag-overlay")).toBeNull();
    expect(tileLines()).toEqual(["a.png: Uploading", "b.png: Waiting"]);

    fireEvent.mouseUp(document, { clientX: 116, clientY: 56 });
    await settleDragListeners();
    unmount();
    expect(request.aborted).toBe(true);
  });
});

describe("the queue", () => {
  it("should upload one file at a time in selection order and keep each success", async () => {
    renderWorkshop();
    const firstFile = fileOf(16, "image/png", "a.png");
    const secondFile = fileOf(16, "image/png", "b.png");
    const thirdFile = fileOf(16, "image/png", "c.png");
    pickFiles(screen.getByLabelText("Choose photos"), [firstFile, secondFile, thirdFile]);

    // A waiting tile has no archive id yet: `data-photo-id` arrives with the success (E4-S5A).
    expect(tileFor("a.png")).not.toHaveAttribute("data-photo-id");

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const first = await requestAt(0);
    // Concurrency one: the click opened exactly one request, in pick order.
    await act(async () => {});
    expect(FakeXhr.instances).toHaveLength(1);
    expect(multipartBody(first).get("file")).toBe(firstFile);
    await waitFor(() => expect(tileFor("a.png")).toHaveAttribute("data-state", "uploading"));
    expect(tileFor("b.png")).toHaveAttribute("data-state", "waiting");
    expect(tileFor("c.png")).toHaveAttribute("data-state", "waiting");

    await respond(first, 201, UPLOADED);
    const second = await requestAt(1);
    expect(FakeXhr.instances).toHaveLength(2);
    expect(multipartBody(second).get("file")).toBe(secondFile);
    // The draft survives its upload (E4-S5A): a.png is stored, not gone — its tile keeps the archive's
    // own id, the value the publish will read.
    expect(tileFor("a.png")).toHaveAttribute("data-state", "added");
    expect(tileFor("a.png")).toHaveAttribute("data-photo-id", UPLOADED.id);
    await waitFor(() => expect(tileFor("b.png")).toHaveAttribute("data-state", "uploading"));

    await respond(second, 201, UPLOADED);
    const third = await requestAt(2);
    expect(multipartBody(third).get("file")).toBe(thirdFile);

    await respond(third, 201, UPLOADED);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 3 photos.");
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("Added 3 photos.");
    expect(screen.getByRole("list", { name: "Selected photos" })).toBeVisible();
    expect(tileLines()).toEqual(["a.png: Added", "b.png: Added", "c.png: Added"]);
    // Nothing is left to send, so the queue button is gone and focus falls through to the picker.
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull();
    await waitFor(() => expect(screen.getByLabelText("Add photos")).toHaveFocus());
  });

  it("should send the files in the displayed order after a reorder", async () => {
    renderWorkshop();
    const firstFile = fileOf(16, "image/png", "a.png");
    const secondFile = fileOf(16, "image/png", "b.png");
    const thirdFile = fileOf(16, "image/png", "c.png");
    pickFiles(screen.getByLabelText("Choose photos"), [firstFile, secondFile, thirdFile]);
    stubGridRects();

    // Arrange the display order with a pointer before any request exists: b, a, c.
    const first = dragActivators()[0];
    if (first === undefined) {
      throw new Error("the first tile has no drag activator");
    }
    fireEvent.mouseDown(first, { clientX: 56, clientY: 56, button: 0 });
    fireEvent.mouseMove(document, { clientX: 66, clientY: 56 });
    await act(async () => {});
    fireEvent.mouseMove(document, { clientX: 176, clientY: 56 });
    await act(async () => {});
    fireEvent.mouseUp(document, { clientX: 176, clientY: 56 });
    await act(async () => {});
    await settleDragListeners();
    expect(tileLines()).toEqual(["b.png: Waiting", "a.png: Waiting", "c.png: Waiting"]);

    // The queue reads the array when the batch starts, so the wire order follows the grid, not pick order.
    const firstRequest = await startUpload();
    expect(multipartBody(firstRequest).get("file")).toBe(secondFile);
    await respond(firstRequest, 201, UPLOADED);

    const secondRequest = await requestAt(1);
    expect(multipartBody(secondRequest).get("file")).toBe(firstFile);
    await respond(secondRequest, 201, UPLOADED);

    const thirdRequest = await requestAt(2);
    expect(multipartBody(thirdRequest).get("file")).toBe(thirdFile);
    await respond(thirdRequest, 201, UPLOADED);

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 3 photos.");
  });

  it("should announce the batch as Uploading. while the queue runs", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);

    const first = await startUpload();
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("Uploading.");

    // A mid-batch failure is not announced: the persistent region stays on the batch's own state, and
    // the settled summary carries the failure to assistive tech. Removing the special case would make
    // this read the selection count instead.
    await respond(first, 415, PROBLEM_415_UNSUPPORTED, "application/problem+json");
    await requestAt(1);
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("Uploading.");
    expect(screen.getByTestId("workshop-status")).not.toHaveTextContent("photos selected");
  });

  it("should keep going after a failure and name the file that failed", async () => {
    renderWorkshop();
    const firstFile = fileOf(16, "image/png", "a.png");
    const secondFile = fileOf(16, "image/png", "b.png");
    const thirdFile = fileOf(16, "image/png", "c.png");
    pickFiles(screen.getByLabelText("Choose photos"), [firstFile, secondFile, thirdFile]);

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const first = await requestAt(0);
    await respond(first, 201, UPLOADED);

    const second = await requestAt(1);
    expect(multipartBody(second).get("file")).toBe(secondFile);
    await respond(second, 415, PROBLEM_415_UNSUPPORTED, "application/problem+json");

    // The third file is sent even though the second failed — one failure never aborts the queue.
    const third = await requestAt(2);
    expect(multipartBody(third).get("file")).toBe(thirdFile);
    await waitFor(() => expect(tileFor("b.png")).toHaveAttribute("data-state", "error"));
    expect(tileFor("b.png")).toHaveTextContent("The archive couldn't read that image.");

    await respond(third, 201, UPLOADED);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent(
      "Added 2 photos. 1 photo couldn't be added.",
    );
    expect(screen.getByTestId("workshop-status")).toHaveTextContent(
      "Added 2 photos. 1 photo couldn't be added.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    // The two successes kept their tiles (E4-S5A); only the failed file is left to send.
    expect(tileFor("a.png")).toHaveAttribute("data-state", "added");
    expect(tileFor("c.png")).toHaveAttribute("data-state", "added");
    // The recovery action is where the keyboard already is after the queue settles.
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus());
  });

  it("should invalidate once per success and never for a failure", async () => {
    const { client } = renderWorkshop();
    client.setQueryData(queryKeys.photos, []);
    client.setQueryData(queryKeys.randomPhoto, UPLOADED);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
      fileOf(16, "image/png", "c.png"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    expect(invalidate).not.toHaveBeenCalled();

    const first = await requestAt(0);
    await respond(first, 201, UPLOADED);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.photos });

    const second = await requestAt(1);
    await respond(second, 415, PROBLEM_415_UNSUPPORTED, "application/problem+json");
    await waitFor(() => expect(tileFor("b.png")).toHaveAttribute("data-state", "error"));
    // A refused upload stores nothing, so it invalidates nothing: the success count does not move.
    expect(invalidate).toHaveBeenCalledTimes(1);

    const third = await requestAt(2);
    await respond(third, 201, UPLOADED);
    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(2));
    expect(client.getQueryState(queryKeys.photos)?.isInvalidated).toBe(true);
    // Prefix matching: `["photos", "random"]` is under `["photos"]`, so one invalidation covers both.
    expect(client.getQueryState(queryKeys.randomPhoto)?.isInvalidated).toBe(true);
  });

  it("should retry failed files with the same File objects", async () => {
    renderWorkshop();
    const firstFile = fileOf(16, "image/png", "a.png");
    const secondFile = fileOf(4096, "image/png", "b.png");
    pickFiles(screen.getByLabelText("Choose photos"), [firstFile, secondFile]);

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const first = await requestAt(0);
    await respond(first, 201, UPLOADED);
    const second = await requestAt(1);
    await respond(second, 415, PROBLEM_415_UNSUPPORTED, "application/problem+json");

    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeVisible());
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent(
      "Added 1 photo. 1 photo couldn't be added.",
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const retry = await requestAt(2);
    // Identity, not equivalence: the same File object, not a re-read from the input.
    expect(multipartBody(retry).get("file")).toBe(secondFile);

    await respond(retry, 201, UPLOADED);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 1 photo.");
  });

  it("should map the archive's failure codes to per-file sentences", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "photo.png")]);
    const request = await startUpload();

    await respond(request, 413, PROBLEM_413_TOO_LARGE, "application/problem+json");

    await waitFor(() => expect(tileFor("photo.png")).toHaveAttribute("data-state", "error"));
    expect(tileFor("photo.png")).toHaveTextContent(
      "That photo is larger than the archive accepts.",
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "error");
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("1 photo couldn't be added.");
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("1 photo couldn't be added.");
  });

  it.each([
    ["network", (request: FakeXhr) => request.failNetwork()],
    ["timeout", (request: FakeXhr) => request.expire()],
  ])("should say the archive did not answer after a %s failure", async (_kind, fail) => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "photo.png")]);
    const request = await startUpload();

    await act(async () => {
      fail(request);
    });

    await waitFor(() => expect(tileFor("photo.png")).toHaveAttribute("data-state", "error"));
    expect(tileFor("photo.png")).toHaveTextContent("The archive didn't answer. Try again.");
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("1 photo couldn't be added.");
  });

  it("should cancel the batch visibly, abort the request and leave the remaining files waiting", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
      fileOf(16, "image/png", "c.png"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const first = await requestAt(0);
    await waitFor(() => expect(tileFor("a.png")).toHaveAttribute("data-state", "uploading"));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    // The sentence must be *visible*, not merely present on a hidden node: the #116 review caught a
    // suite that asserted `toHaveTextContent` on the test id alone.
    const notice = await screen.findByTestId("workshop-notice");
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent("Upload cancelled.");
    expect(first.aborted).toBe(true);
    // The queue stopped: no second request was opened, and no tile was uploaded or failed.
    await act(async () => {});
    expect(FakeXhr.instances).toHaveLength(1);
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    for (const name of ["a.png", "b.png", "c.png"]) {
      expect(tileFor(name)).toHaveAttribute("data-state", "waiting");
    }
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("Upload cancelled.");
    expect(screen.getByRole("button", { name: "Upload" })).toBeVisible();
  });

  it("should keep the successes and their previews when a cancel stops a mixed batch", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const first = await requestAt(0);
    await respond(first, 201, UPLOADED);
    const second = await requestAt(1);
    await waitFor(() => expect(tileFor("b.png")).toHaveAttribute("data-state", "uploading"));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Upload cancelled."),
    );
    expect(second.aborted).toBe(true);
    // The draft survives the cancel too: a.png is stored and keeps its tile, its photo id and its
    // preview; b.png goes back to waiting and the queue button returns for it.
    expect(tileFor("a.png")).toHaveAttribute("data-state", "added");
    expect(tileFor("a.png")).toHaveAttribute("data-photo-id", UPLOADED.id);
    expect(tileFor("b.png")).toHaveAttribute("data-state", "waiting");
    expect(revoke).not.toHaveBeenCalledWith("blob:preview-1");
    expect(revoke).not.toHaveBeenCalledWith("blob:preview-2");
    expect(screen.getByRole("button", { name: "Upload" })).toBeVisible();
  });

  it("should keep the batch summary when a cancel lands after the last response", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "a.png")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const request = await requestAt(0);

    // The review's measured interleaving: the 201 arrives and Cancel is clicked before the mutation's
    // continuation renders. The abort is then a no-op and the photo IS stored — so the screen must not
    // say "Upload cancelled." over a summary whose photo the archive already has.
    act(() => {
      request.respond(201, UPLOADED);
      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 1 photo."),
    );
    expect(screen.getByTestId("workshop-notice")).not.toHaveTextContent("Upload cancelled.");
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
  });

  it("should open no request when the batch is cancelled during preparation", async () => {
    // The story moved the request behind async work; these are the windows it opened. The reviewing
    // pass removed each post-await guard and the suite stayed green — hence this deferred edge.
    let release: (file: File) => void = () => {};
    const file = fileOf(16, "image/png", "slow.png");
    mockedDownscale.mockImplementationOnce(
      () =>
        new Promise<File>((resolve) => {
          release = resolve;
        }),
    );

    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [file]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible());
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {
      release(file);
    });

    await waitFor(() =>
      expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Upload cancelled."),
    );
    expect(FakeXhr.instances).toHaveLength(0);
    expect(tileFor("slow.png")).toHaveAttribute("data-state", "waiting");
  });

  it("should open no request after unmount during preparation", async () => {
    let release: (file: File) => void = () => {};
    const file = fileOf(16, "image/png", "slow.png");
    mockedDownscale.mockImplementationOnce(
      () =>
        new Promise<File>((resolve) => {
          release = resolve;
        }),
    );

    const { unmount } = renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [file]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toBeVisible());

    unmount();
    await act(async () => {
      release(file);
    });

    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should reset the cancellation flag and upload again after a cancelled batch", async () => {
    renderWorkshop();
    const firstFile = fileOf(16, "image/png", "a.png");
    const secondFile = fileOf(16, "image/png", "b.png");
    pickFiles(screen.getByLabelText("Choose photos"), [firstFile, secondFile]);

    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const cancelled = await requestAt(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Upload cancelled."),
    );
    expect(cancelled.aborted).toBe(true);

    // Second batch: without a reset, `cancelledRef` still true makes the loop stop before the first
    // request, leaving the panel on "Upload cancelled." with no request opened.
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));
    const second = await requestAt(1);
    expect(multipartBody(second).get("file")).toBe(firstFile);

    await respond(second, 201, UPLOADED);
    const third = await requestAt(2);
    expect(multipartBody(third).get("file")).toBe(secondFile);
    await respond(third, 201, UPLOADED);

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 2 photos.");
  });

  it("should keep a successful file's preview and revoke it when its tile is removed", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    const first = await requestAt(0);
    await respond(first, 201, UPLOADED);
    const second = await requestAt(1);
    await respond(second, 201, UPLOADED);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected"));

    // The draft survives its upload (E4-S5A): a success no longer revokes — the tile keeps showing
    // the user's own photo — so removal is the only exit this spy can see.
    expect(revoke).not.toHaveBeenCalledWith("blob:preview-1");
    expect(revoke).not.toHaveBeenCalledWith("blob:preview-2");

    fireEvent.click(screen.getByRole("button", { name: "Remove a.png" }));
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:preview-1"));
    expect(revoke).not.toHaveBeenCalledWith("blob:preview-2");
  });

  it("should abort an in-flight upload and revoke every preview when the view unmounts", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const { unmount } = renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    const request = await startUpload();

    unmount();

    expect(request.aborted).toBe(true);
    expect(revoke).toHaveBeenCalledWith("blob:preview-1");
    expect(revoke).toHaveBeenCalledWith("blob:preview-2");
  });

  it("should report real progress for the file in flight, without a percentage", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(4096, "image/png", "a.png"),
      fileOf(4096, "image/png", "b.png"),
    ]);
    const first = await startUpload();

    act(() => {
      first.emitProgress(50, 100);
    });

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "50");
    expect(progressbar).toHaveClass("h-0.5");
    // A line, not a number: no percentage is rendered anywhere on the screen.
    expect(within(screen.getByRole("main")).queryByText(/%/)).toBeNull();

    await respond(first, 201, UPLOADED);
    await requestAt(1);
    // The line resets to the second file's own start instead of carrying the first file's 50 %.
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "0");
  });

  it("should show an indeterminate line when the browser cannot compute the length", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(4096, "image/png", "photo.png")]);
    const request = await startUpload();

    act(() => {
      request.emitProgress(2048, 0);
    });

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).not.toHaveAttribute("aria-valuenow");
    expect(progressbar.firstElementChild).toHaveClass("opacity-25");
  });

  it("should keep Cancel as the only action while the batch runs", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    await startUpload();

    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.queryByRole("button", { name: "Upload" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    // Removal waits for the batch: a tile cannot vanish from under the queue's snapshot.
    expect(screen.getByRole("button", { name: "Remove a.png" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Remove b.png" })).toBeDisabled();
  });

  it("should show the success state without waiting for the refetch", async () => {
    const { client } = renderWorkshop();
    // A mounted feed consumer could make the refetch slow. The hook fires the invalidation without
    // returning its promise, so the success sentence is not gated on it.
    const invalidate = vi.spyOn(client, "invalidateQueries").mockReturnValue(new Promise(() => {}));

    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "photo.png")]);
    const request = await startUpload();
    await respond(request, 201, UPLOADED);

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 1 photo.");
    expect(invalidate).toHaveBeenCalledTimes(1);
  });
});

describe("downscaling before upload", () => {
  it("should send the prepared File and report its size, not the original's", async () => {
    const original = fileOf(8192, "image/png", "big.png");
    const prepared = fileOf(2048, "image/png", "big.png");
    mockedDownscale.mockResolvedValueOnce(prepared);

    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [original]);
    const request = await startUpload();

    expect(mockedDownscale).toHaveBeenCalledWith(original);
    const sent = multipartBody(request).get("file");
    // A distinct object with the prepared size — the queue sends what the edge returned.
    expect(sent).not.toBe(original);
    expect(sent).toBe(prepared);
    expect((sent as File).size).toBe(2048);
    // The line's initial total comes from the file actually sent (8192 would mean the source).
    expect(screen.getByRole("progressbar")).toHaveAttribute("data-total", "2048");
    // The tile keeps painting the user's own photo, not the re-encode.
    expect(document.querySelector("main img")).toHaveAttribute("src", "blob:preview-1");

    await respond(request, 201, UPLOADED);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected"));
  });

  it("should resend the same prepared File on retry instead of downscaling twice", async () => {
    const original = fileOf(4096, "image/png", "a.png");
    const prepared = fileOf(1024, "image/png", "a.png");
    const reWrapped = fileOf(512, "image/png", "a.png");
    let calls = 0;
    mockedDownscale.mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? prepared : reWrapped;
    });

    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [original]);
    const first = await startUpload();
    await respond(first, 415, PROBLEM_415_UNSUPPORTED, "application/problem+json");
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeVisible());

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    const retry = await requestAt(1);

    // Identity, not equivalence: a second encode would return `reWrapped`.
    expect(multipartBody(retry).get("file")).toBe(prepared);
    expect(calls).toBe(1);
    expect(screen.getByRole("progressbar")).toHaveAttribute("data-total", "1024");
  });

  it("should send the original, unchanged, when downscaling rejects", async () => {
    const original = fileOf(4096, "image/png", "a.png");
    mockedDownscale.mockRejectedValueOnce(new Error("no canvas in this environment"));

    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [original]);
    const request = await startUpload();

    expect(multipartBody(request).get("file")).toBe(original);
    expect(screen.getByRole("progressbar")).toHaveAttribute("data-total", "4096");

    await respond(request, 201, UPLOADED);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 1 photo.");
  });
});

describe("StrictMode", () => {
  it("should still open the first upload request after a pick", async () => {
    // `main.tsx` renders the app under `<StrictMode>`, whose dev-only setup → cleanup → setup sequence
    // runs the unmount cleanup once on mount. A cleanup-only `aliveRef` reset left the queue dead before
    // the first interaction (`npm run dev` only; the built bundle cannot see it — #116 review, B1).
    render(
      <StrictMode>
        <QueryClientProvider client={createQueryClient()}>
          <WorkshopView />
        </QueryClientProvider>
      </StrictMode>,
    );

    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "strict.png")]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    const request = await requestAt(0);
    expect(multipartBody(request).get("file")).toBeInstanceOf(File);

    await respond(request, 201, UPLOADED);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 1 photo.");
  });

  it("should reorder with a pointer under StrictMode", async () => {
    // The sortable context mounts the sensors in effects; StrictMode runs every setup → cleanup → setup.
    // If a sensor were registered only on the first setup, the grid would be inert in development while
    // the suite stayed green — the same class of bug as the `aliveRef` fix.
    render(
      <StrictMode>
        <QueryClientProvider client={createQueryClient()}>
          <WorkshopView />
        </QueryClientProvider>
      </StrictMode>,
    );
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "strict-a.png"),
      fileOf(16, "image/png", "strict-b.png"),
    ]);
    stubGridRects();

    const first = dragActivators()[0];
    if (first === undefined) {
      throw new Error("the first tile has no drag activator");
    }
    fireEvent.mouseDown(first, { clientX: 56, clientY: 56, button: 0 });
    fireEvent.mouseMove(document, { clientX: 66, clientY: 56 });
    await act(async () => {});
    fireEvent.mouseMove(document, { clientX: 176, clientY: 56 });
    await act(async () => {});
    fireEvent.mouseUp(document, { clientX: 176, clientY: 56 });
    await act(async () => {});
    await settleDragListeners();

    expect(tileLines()).toEqual(["strict-b.png: Waiting", "strict-a.png: Waiting"]);
  });

  it("should count one extraction after a pick under the double mount", async () => {
    // The empty double mount extracts nothing; the pick's single real answer stands and applies.
    mockedSuggest.mockResolvedValue([suggestion("#1f7a7a", 1)]);
    render(
      <StrictMode>
        <QueryClientProvider client={createQueryClient()}>
          <WorkshopView />
        </QueryClientProvider>
      </StrictMode>,
    );
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "strict.png")]);
    fireEvent.click(await screen.findByRole("button", { name: "Use #1f7a7a, 100% mean share" }));
    expect(mockedSuggest.mock.calls.length).toBe(1);
    expect(screen.getByRole("main").style.getPropertyValue("--aura-bg")).toBe("#1f7a7a");
  });
});

describe("the aura picker", () => {
  it("should offer the ranked suggestions as swatches that theme the workshop", async () => {
    mockedSuggest.mockResolvedValue([suggestion("#1f7a7a", 0.55), suggestion("#c2542a", 0.45)]);
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);

    // Ranked by confidence: display order is rank order, and each swatch reads out its mean share.
    const palette = await screen.findAllByRole("button", { name: /mean share/ });
    expect(palette.map((swatch) => swatch.getAttribute("aria-label"))).toEqual([
      "Use #1f7a7a, 55% mean share",
      "Use #c2542a, 45% mean share",
    ]);

    const second = palette[1];
    if (second === undefined) {
      throw new Error("the picker offered fewer than two swatches");
    }
    fireEvent.click(second);
    const main = screen.getByRole("main");
    expect(main.style.getPropertyValue("--aura-bg")).toBe("#c2542a");
    expect(second).toHaveAttribute("aria-pressed", "true");
    // The aura — one sessionStorage value — is the only thing this view persists (ADR-023).
    expect(window.sessionStorage.length).toBe(1);
    expect(window.sessionStorage.getItem(AURA_STORAGE_KEY)).toBe("#c2542a");
  });

  it("should drop a refused suggestion before it is offered", async () => {
    // Pure black would be a dead control: its press lands on the refusal and no theme.
    mockedSuggest.mockResolvedValue([suggestion("#000000", 0.6), suggestion("#c2542a", 0.4)]);
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "a.png")]);
    const palette = await screen.findAllByRole("button", { name: /mean share/ });
    expect(palette.map((swatch) => swatch.getAttribute("aria-label"))).toEqual([
      "Use #c2542a, 40% mean share",
    ]);
  });

  it("should apply a typed hex live, and report the invalid and refused shapes", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "a.png")]);
    const field = screen.getByLabelText("Aura");
    const main = screen.getByRole("main");

    // Complete and accepted: the preview follows the seventh character — there is no save step.
    fireEvent.change(field, { target: { value: "#1F7A7A" } });
    expect(main.style.getPropertyValue("--aura-bg")).toBe("#1f7a7a");

    // Still typing: quiet. Committing an incomplete value reports it, and the last good value stands.
    fireEvent.change(field, { target: { value: "#12345" } });
    expect(screen.queryByText(/Not a colour/)).toBeNull();
    fireEvent.keyDown(field, { key: "Enter" });
    expect(screen.getByText(/Not a colour/)).toBeVisible();
    expect(main.style.getPropertyValue("--aura-bg")).toBe("#1f7a7a");

    // Leaving the field commits too: the same incomplete value reports it on blur.
    fireEvent.change(field, { target: { value: "#12345" } });
    fireEvent.blur(field);
    expect(screen.getByText(/Not a colour/)).toBeVisible();

    // A pure page is refused by policy (ADR-023) the moment its shape completes.
    fireEvent.change(field, { target: { value: "#000000" } });
    expect(screen.getByText(/outside the palette/)).toBeVisible();
    expect(main.style.getPropertyValue("--aura-bg")).toBe("#1f7a7a");
  });

  it("should reset to the top suggestion, and to neutral when nothing was extracted", async () => {
    mockedSuggest
      .mockResolvedValueOnce([suggestion("#1f7a7a", 0.6), suggestion("#c2542a", 0.4)])
      .mockResolvedValueOnce([]);
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    const main = screen.getByRole("main");

    fireEvent.click(await screen.findByRole("button", { name: "Use #c2542a, 40% mean share" }));
    expect(main.style.getPropertyValue("--aura-bg")).toBe("#c2542a");

    fireEvent.click(screen.getByRole("button", { name: "Reset to extracted" }));
    expect(main.style.getPropertyValue("--aura-bg")).toBe("#1f7a7a");
    expect(window.sessionStorage.getItem(AURA_STORAGE_KEY)).toBe("#1f7a7a");

    // Removing a photo re-extracts; the empty second answer leaves no swatches, and the reset still
    // has a job: clearing the aura back to the neutral set.
    fireEvent.click(screen.getByRole("button", { name: "Remove b.png" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: /mean share/ })).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(main.style.getPropertyValue("--aura-bg")).toBe("");
    // The neutral reset clears the key too: a refresh after it comes back neutral.
    expect(window.sessionStorage.getItem(AURA_STORAGE_KEY)).toBeNull();
  });

  it("should restore a stored aura on mount, clear it on unmount, and survive blocked storage", async () => {
    // Stored uppercase, as a hand-edit might be: the read normalises before holding it.
    window.sessionStorage.setItem(AURA_STORAGE_KEY, "#C2542A");
    const view = renderWorkshop();
    const main = screen.getByRole("main");
    expect(main.style.getPropertyValue("--aura-bg")).toBe("#c2542a");

    // The field follows the session value once the panel is on screen.
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "a.png")]);
    expect(screen.getByLabelText("Aura")).toHaveValue("#c2542a");

    view.unmount();
    expect(main.style.getPropertyValue("--aura-bg")).toBe("");
    // Unmount clears the preview, not the session: the stored value is untouched and still holds it.
    expect(window.sessionStorage.getItem(AURA_STORAGE_KEY)).toBe("#C2542A");

    // A hand-edited value the engine refuses is ignored: the neutral set stays, and the field — the
    // one place the stored choice is shown — starts empty once the panel is on screen.
    window.sessionStorage.setItem(AURA_STORAGE_KEY, "#000000");
    const refused = renderWorkshop();
    expect(screen.getByRole("main").style.getPropertyValue("--aura-bg")).toBe("");
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "a.png")]);
    expect(screen.getByLabelText("Aura")).toHaveValue("");
    refused.unmount();

    // A storage that throws (private modes) must not break the view: the aura lives for the view's life.
    const blockedGet = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const blockedSet = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const blockedRemove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(16, "image/png", "a.png")]);
    fireEvent.change(screen.getByLabelText("Aura"), { target: { value: "#1f7a7a" } });
    expect(screen.getByRole("main").style.getPropertyValue("--aura-bg")).toBe("#1f7a7a");

    // The neutral reset writes `null` — the removeItem path, blocked here — and still clears the aura.
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByRole("main").style.getPropertyValue("--aura-bg")).toBe("");
    blockedGet.mockRestore();
    blockedSet.mockRestore();
    blockedRemove.mockRestore();
  });

  it("should keep the aura and skip re-extraction when the grid is reordered", async () => {
    mockedSuggest.mockResolvedValue([suggestion("#1f7a7a", 0.8), suggestion("#c2542a", 0.2)]);
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), threeFiles());
    fireEvent.click(await screen.findByRole("button", { name: "Use #1f7a7a, 80% mean share" }));
    const main = screen.getByRole("main");
    const extractions = mockedSuggest.mock.calls.length;

    // The pointer reorder E4-S3B measured, to the third slot.
    stubGridRects();
    const first = dragActivators()[0];
    if (first === undefined) {
      throw new Error("the first tile has no drag activator");
    }
    fireEvent.mouseDown(first, { clientX: 56, clientY: 56, button: 0 });
    fireEvent.mouseMove(document, { clientX: 66, clientY: 56 });
    await act(async () => {});
    fireEvent.mouseMove(document, { clientX: 296, clientY: 56 });
    await act(async () => {});
    fireEvent.mouseUp(document, { clientX: 296, clientY: 56 });
    await act(async () => {});
    await settleDragListeners();

    expect(tileLines()[2]).toBe("a.png: Waiting");
    // Membership is unchanged by a reorder, so the photos are not decoded again…
    expect(mockedSuggest.mock.calls.length).toBe(extractions);
    // …and the chosen aura still themes the workshop.
    expect(main.style.getPropertyValue("--aura-bg")).toBe("#1f7a7a");
  });

  it("should rest extraction while the queue runs, and come back when it ends", async () => {
    mockedSuggest
      .mockResolvedValueOnce([suggestion("#1f7a7a", 1)])
      .mockResolvedValue([suggestion("#c2542a", 1)]);
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    await screen.findByRole("button", { name: "Use #1f7a7a, 100% mean share" });
    const extractions = mockedSuggest.mock.calls.length;

    // The first success shrinks the grid mid-upload: membership changed, extraction must not wake.
    const first = await startUpload();
    await respond(first, 201, UPLOADED);
    const second = await requestAt(1);
    expect(mockedSuggest.mock.calls.length).toBe(extractions);

    // The queue ends with a tile left (b failed): the gate reopens for a non-empty selection, the
    // extraction wakes once more, and its answer replaces the one held before the queue.
    await respond(second, 413, PROBLEM_413_TOO_LARGE, "application/problem+json");
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(mockedSuggest.mock.calls.length).toBe(extractions + 1);
    expect(
      await screen.findByRole("button", { name: "Use #c2542a, 100% mean share" }),
    ).toBeVisible();
  });

  it("should drop an answer that lands while the gate is closed", async () => {
    let resolveDoomed: (value: PaletteColor[]) => void = () => {};
    let resolveReopen: (value: PaletteColor[]) => void = () => {};
    mockedSuggest
      .mockImplementationOnce(
        () =>
          new Promise<PaletteColor[]>((resolve) => {
            resolveDoomed = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<PaletteColor[]>((resolve) => {
            resolveReopen = resolve;
          }),
      )
      .mockResolvedValue([]);
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    const first = await startUpload();
    await respond(first, 201, UPLOADED);
    const second = await requestAt(1);

    // The first extraction was in flight when the queue started; the gate's cleanup is what makes
    // its late answer stale. Resolved while the gate is closed, it must not surface when the failed
    // queue brings the picker back — with the increment gone, it would show here.
    resolveDoomed([suggestion("#1f7a7a", 1)]);
    await respond(second, 413, PROBLEM_413_TOO_LARGE, "application/problem+json");
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "error"));
    expect(screen.queryByRole("button", { name: /mean share/ })).toBeNull();

    // The reopen's own extraction lands and stands.
    resolveReopen([suggestion("#c2542a", 1)]);
    expect(
      await screen.findByRole("button", { name: "Use #c2542a, 100% mean share" }),
    ).toBeVisible();
  });
});

describe("accessibility", () => {
  it("should have no structural violations while idle, sortable and uploading", async () => {
    mockedSuggest.mockResolvedValue([suggestion("#1f7a7a", 0.55), suggestion("#c2542a", 0.45)]);
    const { unmount } = renderWorkshop();
    expect(violationSummary(await runAxe(document.body))).toEqual([]);

    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(4096, "image/png", "a.png"),
      fileOf(4096, "image/png", "b.png"),
    ]);
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    // The full aura picker — swatches, field, and the reset once a colour is chosen — joins the sweep.
    fireEvent.click(await screen.findByRole("button", { name: "Use #1f7a7a, 55% mean share" }));
    expect(violationSummary(await runAxe(document.body))).toEqual([]);

    const request = await startUpload();
    act(() => {
      request.emitProgress(50, 100);
    });
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "uploading");
    expect(violationSummary(await runAxe(document.body))).toEqual([]);

    // The first request is still in flight; unmounting is the slice's own abort path.
    unmount();
  });

  it("should have no structural violations with a failed tile", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(4096, "image/png", "c.png")]);
    const failing = await startUpload();
    await respond(failing, 413, PROBLEM_413_TOO_LARGE, "application/problem+json");

    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeVisible());
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "error");
    expect(violationSummary(await runAxe(document.body))).toEqual([]);
  });

  it("should have no structural violations with a settled draft", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [fileOf(4096, "image/png", "c.png")]);
    const request = await startUpload();
    await respond(request, 201, UPLOADED);
    await waitFor(() => expect(tileFor("c.png")).toHaveAttribute("data-state", "added"));

    expect(violationSummary(await runAxe(document.body))).toEqual([]);
  });
});
