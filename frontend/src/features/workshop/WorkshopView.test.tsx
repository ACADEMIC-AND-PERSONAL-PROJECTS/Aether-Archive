import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkshopView } from "./WorkshopView";
import { FakeXhr } from "../../api/__fixtures__/fakeXhr";
import { PROBLEM_413_TOO_LARGE, PROBLEM_415_UNSUPPORTED } from "../../api/__fixtures__/problems";
import { queryKeys } from "../../api/queryKeys";
import { createQueryClient } from "../../app/queryClient";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES } from "../../lib/upload/validation";
import { runAxe, violationSummary } from "../../test/axe";

import type { Photo } from "../../types/api";

/**
 * The workshop's pick-and-upload behaviour, as the user observes it (E4-S1B).
 *
 * The transport's browser edge is the fake from `api/__fixtures__/fakeXhr.ts`; everything above it is the
 * shipped component, the real mutation hook and a real `QueryClient`. The tests pin this slice's criteria
 * — a real progress line, cancellation that keeps the same File, failures that keep it and retry it, and
 * invalidation on success only — plus the picker coverage slice A established and the announcement rule
 * E3-S5B established.
 *
 * jsdom limitation, stated rather than papered over: the file input has no native picker. The suite
 * assigns `files` on the input and fires a real `change` event (the working pattern, probed in this
 * environment: `Object.defineProperty(input, "files", …)` succeeds, while `DataTransfer` does not exist
 * in jsdom 30). The browser-level picker is exercised by the Chromium probe, not here.
 */

const UPLOADED: Photo = {
  id: "9f1c0a3e-6a58-4b0e-9c5a-1f3d7a2b4c6d",
  url: "/images/9f1c0a3e-6a58-4b0e-9c5a-1f3d7a2b4c6d.png",
  category: "uncategorized",
  uploadedAt: "2026-10-17T03:46:21.684975Z",
};

/** A file with its `File`-native size overridden, so a 15 MB boundary does not allocate 15 MB. */
function fileOf(size: number, type = "image/png", name = "photo.png"): File {
  const file = new File([new Uint8Array(Math.min(size, 8))], name, { type });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

function pickFile(input: HTMLElement, file: File): void {
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
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

/** The panel's action that starts the request, awaited until the transport has opened it. */
async function startUpload(name: "Upload" | "Try again" = "Upload"): Promise<FakeXhr> {
  const before = FakeXhr.instances.length;
  fireEvent.click(screen.getByRole("button", { name }));
  await waitFor(() => expect(FakeXhr.instances).toHaveLength(before + 1));
  const request = FakeXhr.instances[before];
  if (request === undefined) {
    throw new Error("the upload action opened no request");
  }
  return request;
}

function multipartBody(request: FakeXhr): FormData {
  if (!(request.body instanceof FormData)) {
    throw new Error("the upload request has no multipart body");
  }
  return request.body;
}

beforeEach(() => {
  FakeXhr.reset();
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the picker", () => {
  it("should accept images only through the native hint, and start idle", () => {
    renderWorkshop();

    expect(screen.getByText("Add a photo to your archive.")).toBeVisible();
    expect(screen.getByLabelText("Choose a photo")).toHaveAttribute("accept", ACCEPT_ATTRIBUTE);
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(screen.getByRole("status")).toHaveTextContent("");
    // The idle screen has no action yet: validation happens on the pick, and no request exists before
    // a file is chosen.
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should refuse a non-image before any request and say why", () => {
    renderWorkshop();

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(16, "text/plain", "notes.png"));

    expect(screen.getByTestId("workshop-notice")).toHaveTextContent(
      "isn't an image the archive can keep",
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(FakeXhr.instances).toHaveLength(0);
    expect(screen.getByRole("status")).toHaveTextContent(
      screen.getByTestId("workshop-notice").textContent ?? "",
    );
  });

  it("should refuse an oversize file, and accept the limit exactly", () => {
    renderWorkshop();
    const input = screen.getByLabelText("Choose a photo");

    pickFile(input, fileOf(MAX_UPLOAD_BYTES + 1));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("larger than 15 MB");
    expect(FakeXhr.instances).toHaveLength(0);
    expect(screen.queryAllByRole("button")).toHaveLength(0);

    pickFile(input, fileOf(MAX_UPLOAD_BYTES));
    expect(screen.getByRole("button", { name: "Upload" })).toBeVisible();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should show the picked photo, name the state and move focus to the upload action", async () => {
    renderWorkshop();

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(2048));
    const upload = screen.getByRole("button", { name: "Upload" });

    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(document.querySelector("main img")).not.toBeNull();
    // One message, two roles: the panel's sentence and the persistent status region.
    expect(within(screen.getByRole("main")).getByText("Photo selected.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Photo selected.");
    expect(screen.getByLabelText("Choose another")).toBeVisible();
    await waitFor(() => expect(upload).toHaveFocus());
  });

  it("should load the preview lazily and decode it off the main thread", () => {
    renderWorkshop();

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(2048));
    const preview = document.querySelector("main img");
    if (!(preview instanceof HTMLImageElement)) {
      throw new Error("the picked file has no preview");
    }

    // `.claude/rules/frontend.md`: every image except the splash hero. The preview is full-bleed, so
    // `lazy` costs nothing here and keeps the rule uniform for the grid and dump images that follow.
    expect(preview).toHaveAttribute("loading", "lazy");
    expect(preview).toHaveAttribute("decoding", "async");
  });

  it("should return to the picker when a replacement pick is refused", () => {
    renderWorkshop();
    pickFile(screen.getByLabelText("Choose a photo"), fileOf(2048));
    expect(document.querySelector("main img")).not.toBeNull();

    pickFile(screen.getByLabelText("Choose another"), fileOf(16, "text/plain", "notes.png"));

    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(document.querySelector("main img")).toBeNull();
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent(
      "isn't an image the archive can keep",
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });

  it("should drop a preview the browser cannot decode, keeping the file selected", async () => {
    renderWorkshop();

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(64, "image/png", "decoy.png"));
    const preview = document.querySelector("main img");
    if (!(preview instanceof HTMLImageElement)) {
      throw new Error("the picked file has no preview");
    }

    fireEvent.error(preview);

    await waitFor(() => expect(document.querySelector("main img")).toBeNull());
    // The broken glyph is gone, but the selection is not: the server still gets to judge the bytes.
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    // The scrim stays behind the panel when the preview is dropped, so the glass still composites
    // over a known backdrop rather than the raw base alone.
    const backdrops = document.querySelectorAll('main [aria-hidden="true"]');
    expect(backdrops).toHaveLength(1);
    expect(backdrops[0]?.tagName).toBe("DIV");
    expect(within(screen.getByRole("main")).getByText("Photo selected.")).toBeVisible();
    expect(screen.getByLabelText("Choose another")).toBeVisible();
    expect(screen.getByRole("button", { name: "Upload" })).toBeVisible();
  });
});

describe("uploading", () => {
  it("should report real progress, cancel it, and keep the same File for another attempt", async () => {
    renderWorkshop();
    const picked = fileOf(4096);
    pickFile(screen.getByLabelText("Choose a photo"), picked);
    const first = await startUpload();

    // A duplicate-submit guard: while the request is in flight, Cancel is the ONLY action. The
    // reviewing pass added a second Upload button inside this branch and the suite stayed green.
    expect(within(screen.getByRole("main")).getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    expect(multipartBody(first).get("category")).toBe("uncategorized");
    expect(multipartBody(first).get("file")).toBe(picked);

    act(() => {
      first.emitProgress(50, 100);
    });

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "50");
    expect(progressbar).toHaveClass("h-0.5");
    // A line, not a number: no percentage is rendered anywhere on the screen.
    expect(within(screen.getByRole("main")).queryByText(/%/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(within(screen.getByRole("main")).getByText("Upload cancelled.")).toBeVisible(),
    );

    expect(first.aborted).toBe(true);
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(screen.getByRole("status")).toHaveTextContent("Upload cancelled.");

    // The same File object is retried — nothing was dropped with the aborted request.
    const second = await startUpload();
    expect(multipartBody(second).get("file")).toBe(picked);
  });

  it("should show an indeterminate line when the browser cannot compute the length", async () => {
    renderWorkshop();
    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    const request = await startUpload();

    act(() => {
      request.emitProgress(2048, 0);
    });

    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).not.toHaveAttribute("aria-valuenow");
    expect(progressbar.firstElementChild).toHaveClass("opacity-25");
  });

  it("should surface a failure, keep the file and retry it successfully", async () => {
    renderWorkshop();
    const picked = fileOf(4096);
    pickFile(screen.getByLabelText("Choose a photo"), picked);
    const first = await startUpload();

    await act(async () => {
      first.respond(415, PROBLEM_415_UNSUPPORTED, "application/problem+json");
    });

    // The sentence is shown in the panel and announced in the status region — one message, two roles.
    await waitFor(() =>
      expect(
        within(screen.getByRole("main")).getByText("The archive couldn't read that image."),
      ).toBeVisible(),
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "error");
    expect(screen.getByLabelText("Choose another")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("The archive couldn't read that image.");
    // Focus follows the failure: the recovery action is where the keyboard already is. The reviewing
    // pass removed this branch of the focus effect and the suite stayed green.
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toHaveFocus());

    const second = await startUpload("Try again");
    expect(multipartBody(second).get("file")).toBe(picked);

    await act(async () => {
      second.respond(201, UPLOADED);
    });

    await waitFor(() =>
      expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added to your archive."),
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(screen.getByRole("status")).toHaveTextContent("Added to your archive.");
    // Focus returns to the picker after a success, so the next photo is one keystroke away.
    await waitFor(() => expect(screen.getByLabelText("Choose a photo")).toHaveFocus());
  });

  it("should map the archive's upload-too-large code to its own sentence", async () => {
    renderWorkshop();
    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    const request = await startUpload();

    await act(async () => {
      request.respond(413, PROBLEM_413_TOO_LARGE, "application/problem+json");
    });

    await waitFor(() =>
      expect(
        within(screen.getByRole("main")).getByText(
          "That photo is larger than the archive accepts.",
        ),
      ).toBeVisible(),
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "error");
    expect(screen.getByRole("status")).toHaveTextContent(
      "That photo is larger than the archive accepts.",
    );
  });

  it.each([
    ["network", (request: FakeXhr) => request.failNetwork()],
    ["timeout", (request: FakeXhr) => request.expire()],
  ])("should say the archive did not answer after a %s failure", async (_kind, fail) => {
    renderWorkshop();
    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    const request = await startUpload();

    await act(async () => {
      fail(request);
    });

    await waitFor(() =>
      expect(
        within(screen.getByRole("main")).getByText("The archive didn't answer. Try again."),
      ).toBeVisible(),
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("The archive didn't answer. Try again.");
  });

  it("should invalidate the feed and the splash hero on success, and never on failure", async () => {
    const { client } = renderWorkshop();
    client.setQueryData(queryKeys.photos, []);
    client.setQueryData(queryKeys.randomPhoto, UPLOADED);
    const invalidate = vi.spyOn(client, "invalidateQueries");

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    const first = await startUpload();

    // A request in flight, and a failure, change nothing the archive holds.
    expect(client.getQueryState(queryKeys.photos)?.isInvalidated).toBe(false);
    await act(async () => {
      first.respond(415, PROBLEM_415_UNSUPPORTED, "application/problem+json");
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeVisible());
    expect(invalidate).not.toHaveBeenCalled();
    expect(client.getQueryState(queryKeys.photos)?.isInvalidated).toBe(false);
    expect(client.getQueryState(queryKeys.randomPhoto)?.isInvalidated).toBe(false);

    const second = await startUpload("Try again");
    await act(async () => {
      second.respond(201, UPLOADED);
    });

    await waitFor(() => expect(invalidate).toHaveBeenCalledTimes(1));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.photos });
    await waitFor(() => expect(client.getQueryState(queryKeys.photos)?.isInvalidated).toBe(true));
    // Prefix matching: `["photos", "random"]` is under `["photos"]`, so one invalidation covers both.
    expect(client.getQueryState(queryKeys.randomPhoto)?.isInvalidated).toBe(true);
  });

  it("should show the success state without waiting for the refetch", async () => {
    const { client } = renderWorkshop();
    // A mounted feed consumer could make the refetch slow. The hook fires the invalidation without
    // returning its promise, so the success sentence is not gated on it — measured by the reviewing
    // pass: with an awaited callback the view stayed `uploading` until this promise resolved.
    const invalidate = vi.spyOn(client, "invalidateQueries").mockReturnValue(new Promise(() => {}));

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    const request = await startUpload();
    await act(async () => {
      request.respond(201, UPLOADED);
    });

    await waitFor(() =>
      expect(screen.getByTestId("workshop-notice")).toHaveTextContent("Added to your archive."),
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("should abort an in-flight upload when the view unmounts", async () => {
    const { unmount } = renderWorkshop();
    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    const request = await startUpload();

    unmount();

    expect(request.aborted).toBe(true);
  });
});

describe("accessibility", () => {
  it("should have no structural violations while idle, selected, uploading and in error", async () => {
    renderWorkshop();
    expect(violationSummary(await runAxe(document.body))).toEqual([]);

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(violationSummary(await runAxe(document.body))).toEqual([]);

    const request = await startUpload();
    act(() => {
      request.emitProgress(50, 100);
    });
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "uploading");
    expect(violationSummary(await runAxe(document.body))).toEqual([]);

    await act(async () => {
      request.respond(413, PROBLEM_413_TOO_LARGE, "application/problem+json");
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeVisible());
    expect(violationSummary(await runAxe(document.body))).toEqual([]);
  });
});
