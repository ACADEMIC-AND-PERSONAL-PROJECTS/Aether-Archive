import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkshopView } from "./WorkshopView";
import { FakeXhr } from "../../api/__fixtures__/fakeXhr";
import { PROBLEM_413_TOO_LARGE, PROBLEM_415_UNSUPPORTED } from "../../api/__fixtures__/problems";
import { queryKeys } from "../../api/queryKeys";
import { createQueryClient } from "../../app/queryClient";
import { downscaleForUpload } from "../../lib/upload/downscale";
import { MAX_SELECTION } from "../../lib/upload/selection";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES } from "../../lib/upload/validation";
import { runAxe, violationSummary } from "../../test/axe";

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
 * The workshop's multi-select and sequential-queue behaviour (E4-S2A2), as the user observes it.
 *
 * The transport's browser edge is the fake from `api/__fixtures__/fakeXhr.ts`; everything above it is the
 * shipped component, the real mutation hook and a real `QueryClient`. The tests pin this slice's criteria
 * — the cap and its explanation, a tile per file with a real remove button, one request at a time in
 * selection order, per-file failure isolation, retry identity, batch cancellation and its reset — plus
 * the picker and announcement contracts E4-S1A/S1B/E3-S5B/A1 established.
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

/**
 * jsdom has no layout, so every `getBoundingClientRect()` is 0×0 and `sortableKeyboardCoordinates`
 * cannot resolve which tile is "to the right". The probe run before these tests showed exactly what
 * that costs: Space still picks a tile up and Space still drops it, and every announcement fires, but
 * the arrow keys find no neighbour because every rect overlaps at the origin. Giving the list items a
 * three-column 120 px pitch is the layout a phone supplies; the test then reads the order the user
 * would see. The browser probe repeats the same keys in Chromium against real layout.
 */
function stubGridRects(): void {
  selectedTiles().forEach((tile, index) => {
    const left = (index % 3) * 120;
    const top = Math.floor(index / 3) * 120;
    tile.getBoundingClientRect = () =>
      ({
        x: left,
        y: top,
        width: 112,
        height: 112,
        top,
        left,
        right: left + 112,
        bottom: top + 112,
        toJSON: () => ({}),
      }) as DOMRect;
  });
}

/** A keyboard press, then the event loop turn dnd-kit's keyboard sensor needs to attach its listener. */
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
    expect(screen.getByRole("status")).toHaveTextContent("");
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
  it("should expose each tile as a named sortable with its position", () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
      fileOf(16, "image/png", "c.png"),
    ]);

    const first = screen.getByRole("button", { name: "Photo 1 of 3: a.png" });
    expect(first).toHaveAttribute("aria-roledescription", "sortable");
    expect(first).toHaveAttribute("tabindex", "0");
    expect(first).toHaveClass("touch-manipulation");
    expect(screen.getByRole("button", { name: "Photo 3 of 3: c.png" })).toBeVisible();

    // The remove control is a sibling of the drag surface, so a pointer-down on it reaches no sensor.
    const remove = screen.getByRole("button", { name: "Remove a.png" });
    expect(first.contains(remove)).toBe(false);
    expect(remove.contains(first)).toBe(false);

    // The instructions the tile points at are the custom ones, not dnd-kit's default.
    expect(first.getAttribute("aria-describedby")).not.toBeNull();
    expect(screen.getByText(/To move a photo, press Space or Enter/)).toBeInTheDocument();
  });

  it("should move a focused tile with the keyboard and announce each position", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
      fileOf(16, "image/png", "c.png"),
    ]);
    stubGridRects();

    const first = screen.getByRole("button", { name: "Photo 1 of 3: a.png" });
    first.focus();
    expect(first).toHaveFocus();

    await pressKey(first, "Space", " ");
    expect(first).toHaveAttribute("aria-pressed", "true");
    // Pick-up is immediately followed by an over event on the tile itself, so the persistent live
    // region settles on the position-1 sentence; the pick-up wording is pinned by its own unit test.
    expect(screen.getByText("Photo 1 of 3 moved to position 1.")).toBeInTheDocument();

    await pressKey(document, "ArrowRight", "ArrowRight");
    expect(screen.getByText("Photo 1 of 3 moved to position 2.")).toBeInTheDocument();

    await pressKey(document, "Space", " ");
    expect(screen.getByText("Photo 2 of 3 dropped.")).toBeInTheDocument();
    expect(tileLines()).toEqual(["b.png: Waiting", "a.png: Waiting", "c.png: Waiting"]);
  });

  it("should cancel a keyboard move with Escape and keep the order", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();

    const first = screen.getByRole("button", { name: "Photo 1 of 2: a.png" });
    first.focus();
    await pressKey(first, "Space", " ");
    await pressKey(document, "ArrowRight", "ArrowRight");
    await pressKey(document, "Escape", "Escape");

    expect(
      screen.getByText("Move cancelled. Photo 1 of 2 is back in position 1."),
    ).toBeInTheDocument();
    expect(tileLines()).toEqual(["a.png: Waiting", "b.png: Waiting"]);
  });

  it("should lift on a long press and leave a swipe to the browser", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();

    const first = screen.getByRole("button", { name: "Photo 1 of 2: a.png" });
    fireEvent.touchStart(first, { touches: [{ clientX: 0, clientY: 0 }] });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 270));
    });
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.touchEnd(first, { touches: [] });
    await act(async () => {});

    // A swipe that travels past the 8 px tolerance before the 250 ms elapses cancels the pending drag,
    // which is what lets the same touch scroll the grid instead of lifting a tile.
    fireEvent.touchStart(first, { touches: [{ clientX: 0, clientY: 0 }] });
    fireEvent.touchMove(first, { touches: [{ clientX: 0, clientY: 20 }] });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 270));
    });
    expect(first).not.toHaveAttribute("aria-pressed");
    expect(document.querySelector('[data-dragging="true"]')).toBeNull();
    fireEvent.touchEnd(first, { touches: [] });
  });

  it("should start a mouse drag only after 8 px of travel", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();

    const first = screen.getByRole("button", { name: "Photo 1 of 2: a.png" });
    fireEvent.mouseDown(first, { clientX: 0, clientY: 0, button: 0 });
    fireEvent.mouseMove(document, { clientX: 4, clientY: 0 });
    await act(async () => {});
    expect(first).not.toHaveAttribute("aria-pressed");

    fireEvent.mouseMove(document, { clientX: 10, clientY: 0 });
    await act(async () => {});
    expect(first).toHaveAttribute("aria-pressed", "true");
    fireEvent.mouseUp(document);
  });

  it("should not start a drag from the remove control", async () => {
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);

    const remove = screen.getByRole("button", { name: "Remove a.png" });
    fireEvent.touchStart(remove, { touches: [{ clientX: 0, clientY: 0 }] });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });

    expect(screen.getByRole("button", { name: "Photo 1 of 2: a.png" })).not.toHaveAttribute(
      "aria-pressed",
    );
    expect(document.querySelector('[data-dragging="true"]')).toBeNull();
    fireEvent.touchEnd(remove, { touches: [] });
    expect(screen.getByRole("button", { name: "Remove a.png" })).toBeVisible();
  });

  it("should refuse a drag while the batch is uploading", async () => {
    const { unmount } = renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    // The queue captured the array when it started; a move now would make the grid disagree with the
    // requests already on the wire, so the tiles are aria-disabled and the sensors have no listeners.
    const request = await startUpload();
    const first = screen.getByRole("button", { name: "Photo 1 of 2: a.png" });
    expect(first).toHaveAttribute("aria-disabled", "true");
    stubGridRects();

    await pressKey(first, "Space", " ");
    await pressKey(document, "ArrowRight", "ArrowRight");

    expect(first).not.toHaveAttribute("aria-pressed");
    expect(tileLines()).toEqual(["a.png: Uploading", "b.png: Waiting"]);

    unmount();
    expect(request.aborted).toBe(true);
  });

  it("should remove the settle motion when the reader asks for reduced motion", async () => {
    const { unmount } = renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();
    const first = screen.getByRole("button", { name: "Photo 1 of 2: a.png" });
    first.focus();
    await pressKey(first, "Space", " ");
    // The settle is only emitted while a drag is live; the untouched neighbour carries it.
    expect(tileFor("b.png").style.transition).toContain("200ms");
    unmount();

    // jsdom has no matchMedia; the stubbed query reports the preference the hook then reads.
    const matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    vi.stubGlobal("matchMedia", matchMedia);

    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    stubGridRects();
    const reducedFirst = screen.getByRole("button", { name: "Photo 1 of 2: a.png" });
    reducedFirst.focus();
    await pressKey(reducedFirst, "Space", " ");

    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(tileFor("b.png").style.transition).toBe("");
    expect(screen.getByRole("button", { name: "Photo 1 of 2: a.png" })).toBeVisible();
  });
});

describe("the queue", () => {
  it("should upload one file at a time in selection order and remove each success", async () => {
    renderWorkshop();
    const firstFile = fileOf(16, "image/png", "a.png");
    const secondFile = fileOf(16, "image/png", "b.png");
    const thirdFile = fileOf(16, "image/png", "c.png");
    pickFiles(screen.getByLabelText("Choose photos"), [firstFile, secondFile, thirdFile]);

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
    expect(screen.queryByRole("button", { name: "Remove a.png" })).toBeNull();
    await waitFor(() => expect(tileFor("b.png")).toHaveAttribute("data-state", "uploading"));

    await respond(second, 201, UPLOADED);
    const third = await requestAt(2);
    expect(multipartBody(third).get("file")).toBe(thirdFile);

    await respond(third, 201, UPLOADED);
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 3 photos.");
    expect(screen.getByTestId("workshop-status")).toHaveTextContent("Added 3 photos.");
    expect(screen.queryByRole("list", { name: "Selected photos" })).toBeNull();
    // Focus returns to the picker after a full success, so the next batch is one keystroke away.
    await waitFor(() => expect(screen.getByLabelText("Choose photos")).toHaveFocus());
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
    expect(screen.queryByRole("button", { name: "Remove a.png" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove c.png" })).toBeNull();
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
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle"));
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
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
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

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 2 photos.");
  });

  it("should revoke a successful file's preview when its tile leaves the grid", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    renderWorkshop();
    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(16, "image/png", "a.png"),
      fileOf(16, "image/png", "b.png"),
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Upload" }));

    const first = await requestAt(0);
    await respond(first, 201, UPLOADED);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:preview-1"));

    const second = await requestAt(1);
    await respond(second, 201, UPLOADED);
    await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:preview-2"));
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

    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle"));
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
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle"));
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
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle"));
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
    await waitFor(() => expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle"));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added 1 photo.");
  });

  it("should reorder with the keyboard under StrictMode", async () => {
    // The sortable context mounts sensors and droppable registrations in effects; StrictMode runs every
    // setup → cleanup → setup. If a sensor were registered only on the first setup, the grid would be
    // inert in development while the suite stayed green — the same class of bug as the `aliveRef` fix.
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

    const first = screen.getByRole("button", { name: "Photo 1 of 2: strict-a.png" });
    first.focus();
    await pressKey(first, "Space", " ");
    await pressKey(document, "ArrowRight", "ArrowRight");
    await pressKey(document, "Space", " ");

    expect(tileLines()).toEqual(["strict-b.png: Waiting", "strict-a.png: Waiting"]);
  });
});

describe("accessibility", () => {
  it("should have no structural violations while idle, sortable and uploading", async () => {
    const { unmount } = renderWorkshop();
    expect(violationSummary(await runAxe(document.body))).toEqual([]);

    pickFiles(screen.getByLabelText("Choose photos"), [
      fileOf(4096, "image/png", "a.png"),
      fileOf(4096, "image/png", "b.png"),
    ]);
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    // Since E4-S3 the selected state is also the sortable state: axe sees the two role="button"
    // activators, the instructions they describe, and dnd-kit's own live region beside the workshop's.
    expect(screen.getByRole("button", { name: "Photo 1 of 2: a.png" })).toBeVisible();
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
});
