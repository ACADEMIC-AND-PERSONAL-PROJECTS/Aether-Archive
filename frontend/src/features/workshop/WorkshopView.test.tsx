import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { WorkshopView } from "./WorkshopView";
import { FakeXhr } from "../../api/__fixtures__/fakeXhr";
import { PROBLEM_415_UNSUPPORTED } from "../../api/__fixtures__/problems";
import { queryKeys } from "../../api/queryKeys";
import { createQueryClient } from "../../app/queryClient";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES } from "../../lib/upload/validation";
import { runAxe, violationSummary } from "../../test/axe";

import type { Photo } from "../../types/api";

/**
 * The workshop's upload behaviour, as the user observes it (E4-S1).
 *
 * The transport's browser edge is the fake from `api/__fixtures__/fakeXhr.ts`; everything above it is the
 * shipped component, the real mutation hook and a real `QueryClient`. The tests pin the four criteria
 * the story names — validation refuses before the network, failures keep the file and retry it, success
 * invalidates both consumers of the photo list, progress and cancel are reachable — plus the
 * announcement rule E3-S5B established.
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

function renderWorkshop(): QueryClient {
  const client = createQueryClient();
  render(
    <QueryClientProvider client={client}>
      <WorkshopView />
    </QueryClientProvider>,
  );
  return client;
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
    const input = screen.getByLabelText("Choose a photo");
    expect(input).toHaveAttribute("accept", ACCEPT_ATTRIBUTE);
    expect(screen.getByRole("status")).toHaveTextContent("");
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should refuse a non-image before any request and say why", () => {
    renderWorkshop();

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(16, "text/plain", "notes.png"));

    expect(screen.getByTestId("workshop-notice")).toHaveTextContent(
      "isn't an image the archive can keep",
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
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

    pickFile(input, fileOf(MAX_UPLOAD_BYTES));
    expect(screen.getByRole("button", { name: "Upload" })).toBeVisible();
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it("should show the picked photo and move focus to the action", async () => {
    renderWorkshop();

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(2048));
    const upload = screen.getByRole("button", { name: "Upload" });

    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(document.querySelector("main img")).not.toBeNull();
    await waitFor(() => expect(upload).toHaveFocus());
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
    expect(screen.getByRole("button", { name: "Upload" })).toBeVisible();
  });
});

describe("uploading", () => {
  it("should report progress and cancel without losing the file", async () => {
    renderWorkshop();
    const picked = fileOf(4096);
    pickFile(screen.getByLabelText("Choose a photo"), picked);
    const first = await startUpload();

    expect(multipartBody(first).get("category")).toBe("uncategorized");

    act(() => {
      first.emitProgress(50, 100);
    });
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByText("Upload cancelled.")).toBeVisible());

    expect(first.aborted).toBe(true);
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");

    // The same File object is retried — nothing was dropped with the aborted request.
    const second = await startUpload();
    expect(multipartBody(second).get("file")).toBe(picked);
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
  });

  it("should invalidate the feed and the splash hero on success, and only then", async () => {
    const client = renderWorkshop();
    client.setQueryData(queryKeys.photos, []);
    client.setQueryData(queryKeys.randomPhoto, UPLOADED);

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    const request = await startUpload();

    // A request in flight, and even a failure, changes nothing the archive holds.
    expect(client.getQueryState(queryKeys.photos)?.isInvalidated).toBe(false);
    await act(async () => {
      request.respond(201, UPLOADED);
    });

    await waitFor(() => expect(client.getQueryState(queryKeys.photos)?.isInvalidated).toBe(true));
    // Prefix matching: `["photos", "random"]` is under `["photos"]`, so one invalidation covers both.
    expect(client.getQueryState(queryKeys.randomPhoto)?.isInvalidated).toBe(true);
  });
});

describe("accessibility", () => {
  it("should have no structural violations in the idle and error states", async () => {
    renderWorkshop();
    expect(violationSummary(await runAxe(document.body))).toEqual([]);

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    const request = await startUpload();
    await act(async () => {
      request.respond(415, PROBLEM_415_UNSUPPORTED, "application/problem+json");
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Try again" })).toBeVisible());

    expect(violationSummary(await runAxe(document.body))).toEqual([]);
  });
});
