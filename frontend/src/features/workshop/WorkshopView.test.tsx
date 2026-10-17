import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { WorkshopView } from "./WorkshopView";
import { ACCEPT_ATTRIBUTE, MAX_UPLOAD_BYTES } from "../../lib/upload/validation";
import { runAxe, violationSummary } from "../../test/axe";

/**
 * The workshop's pick-and-validate slice, as the user observes it (E4-S1A).
 *
 * This slice sends nothing: there is no transport, no upload action and no progress element, so the
 * tests assert the picker hint, the three refusals the client can decide itself, the selected preview
 * and its focus/announcement. `expectNoUploadAction` is part of the contract, not a nicety — the screen
 * must not promise an action that slices B and C have not shipped yet.
 *
 * jsdom limitation, stated rather than papered over: the file input has no native picker. The suite
 * assigns `files` on the input and fires a real `change` event (the working pattern, probed in this
 * environment: `Object.defineProperty(input, "files", …)` succeeds, while `DataTransfer` does not exist
 * in jsdom 30). The browser-level picker is exercised by the Chromium probe, not here.
 */

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

function expectNoUploadAction(): void {
  expect(screen.queryByRole("button", { name: /upload/i })).toBeNull();
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByText(/upload/i)).toBeNull();
}

describe("the picker", () => {
  it("should accept images only through the native hint, and start idle", () => {
    render(<WorkshopView />);

    expect(screen.getByText("Add a photo to your archive.")).toBeVisible();
    expect(screen.getByLabelText("Choose a photo")).toHaveAttribute("accept", ACCEPT_ATTRIBUTE);
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(screen.getByRole("status")).toHaveTextContent("");
    expectNoUploadAction();
  });

  it("should refuse a non-image and say why, without leaving the picker", () => {
    render(<WorkshopView />);

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(16, "text/plain", "notes.png"));

    expect(screen.getByTestId("workshop-notice")).toHaveTextContent(
      "isn't an image the archive can keep",
    );
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(document.querySelector("main img")).toBeNull();
    expect(screen.getByRole("status")).toHaveTextContent(
      screen.getByTestId("workshop-notice").textContent ?? "",
    );
    expectNoUploadAction();
  });

  it("should refuse an oversize file, and accept the limit exactly", () => {
    render(<WorkshopView />);
    const input = screen.getByLabelText("Choose a photo");

    pickFile(input, fileOf(MAX_UPLOAD_BYTES + 1));
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent("larger than 15 MB");
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");

    pickFile(input, fileOf(MAX_UPLOAD_BYTES));
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(screen.queryByTestId("workshop-notice")).toBeNull();
    expect(document.querySelector("main img")).not.toBeNull();
    expectNoUploadAction();
  });

  it("should show the picked photo, name the state and move focus to the picker", async () => {
    render(<WorkshopView />);

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(2048));

    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(document.querySelector("main img")).not.toBeNull();
    // One message, two roles: the panel's sentence and the persistent status region.
    expect(within(screen.getByRole("main")).getByText("Photo selected.")).toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("Photo selected.");

    const replace = screen.getByLabelText("Choose another");
    await waitFor(() => expect(replace).toHaveFocus());
  });

  it("should return to the picker when a replacement pick is refused", () => {
    render(<WorkshopView />);
    pickFile(screen.getByLabelText("Choose a photo"), fileOf(2048));
    expect(document.querySelector("main img")).not.toBeNull();

    pickFile(screen.getByLabelText("Choose another"), fileOf(16, "text/plain", "notes.png"));

    expect(screen.getByRole("main")).toHaveAttribute("data-state", "idle");
    expect(document.querySelector("main img")).toBeNull();
    expect(screen.getByTestId("workshop-notice")).toHaveTextContent(
      "isn't an image the archive can keep",
    );
    expectNoUploadAction();
  });

  it("should drop a preview the browser cannot decode, keeping the selection", async () => {
    render(<WorkshopView />);

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(64, "image/png", "decoy.png"));
    const preview = document.querySelector("main img");
    if (!(preview instanceof HTMLImageElement)) {
      throw new Error("the picked file has no preview");
    }

    fireEvent.error(preview);

    await waitFor(() => expect(document.querySelector("main img")).toBeNull());
    // The broken glyph is gone, but the selection is not: only the server can judge the bytes.
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");
    expect(within(screen.getByRole("main")).getByText("Photo selected.")).toBeVisible();
    expect(screen.getByLabelText("Choose another")).toBeVisible();
    expectNoUploadAction();
  });
});

describe("accessibility", () => {
  it("should have no structural violations in the idle and selected states", async () => {
    render(<WorkshopView />);
    expect(violationSummary(await runAxe(document.body))).toEqual([]);

    pickFile(screen.getByLabelText("Choose a photo"), fileOf(4096));
    expect(screen.getByRole("main")).toHaveAttribute("data-state", "selected");

    expect(violationSummary(await runAxe(document.body))).toEqual([]);
  });
});
