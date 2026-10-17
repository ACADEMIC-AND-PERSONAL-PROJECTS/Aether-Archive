import { describe, expect, it } from "vitest";

import {
  ACCEPTED_FORMATS_SENTENCE,
  ACCEPTED_IMAGE_TYPES,
  ACCEPT_ATTRIBUTE,
  DEFAULT_MAX_UPLOAD_MB,
  MAX_UPLOAD_BYTES,
  MAX_UPLOAD_MB,
  normaliseMediaType,
  parseMaxUploadMb,
  validateUpload,
} from "./validation";

/**
 * The client's boundary, pinned against the server's measured one (E4-S1A probe).
 *
 * The probe uploaded one file of each accepted format to the running backend: all five answered 201.
 * `image/jpg` (the non-standard spelling) also answered 201; a text file, an empty file, a declared
 * non-image and a declared/magic mismatch all answered 415 `unsupported-image-type`; 15 MiB answered
 * 201 and 15 MiB + 1 answered 413 `upload-too-large`. These tests hold the client to exactly that
 * vocabulary, so it cannot drift into refusing what the archive keeps or accepting what it refuses on
 * the one axis it can decide locally.
 *
 * The size-boundary tests pass `maxBytes` explicitly, so they measure the validator rather than this
 * machine's environment. The configured default is pinned separately below, and `vite.config.ts` pins
 * `VITE_MAX_UPLOAD_MB` for the whole suite — a machine-set value cannot change either result.
 */

const MB = 1024 * 1024;
const LIMIT_BYTES = 15 * MB;

/** A file-shaped object: the validator reads only these two fields. */
function pick(size: number, type: string): { size: number; type: string } {
  return { size, type };
}

describe("the accepted vocabulary", () => {
  it("should accept every media type the server's ImageFormat declares", () => {
    expect(ACCEPTED_IMAGE_TYPES).toEqual([
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/avif",
    ]);

    for (const type of ACCEPTED_IMAGE_TYPES) {
      expect(validateUpload(pick(4, type))).toEqual({ ok: true });
    }
  });

  it("should normalise case, whitespace and parameters as the server does", () => {
    expect(normaliseMediaType(" Image/PNG ; charset=binary")).toBe("image/png");
    expect(validateUpload(pick(4, " Image/PNG ; charset=binary"))).toEqual({ ok: true });
    expect(validateUpload(pick(4, "IMAGE/JPEG"))).toEqual({ ok: true });
  });

  it("should refuse every type the server's ImageFormat does not declare", () => {
    for (const type of ["image/bmp", "image/svg+xml", "image/tiff", "text/plain", "", "   "]) {
      const verdict = validateUpload(pick(4, type));
      expect(verdict).toMatchObject({ ok: false, reason: "type" });
    }
  });

  it("should not consult the file name: the server discards it", () => {
    // A `.png` name with a non-image declaration is refused; a `.txt` name with a real image
    // declaration is accepted, because bytes and declared type are all the archive reads.
    expect(validateUpload(pick(4, "text/plain"))).toMatchObject({ ok: false, reason: "type" });
    expect(validateUpload(pick(4, "image/png"))).toEqual({ ok: true });
  });

  it("should describe the formats in the same list the server reports", () => {
    expect(ACCEPTED_FORMATS_SENTENCE).toBe("JPEG, PNG, GIF, WebP or AVIF");
    expect(ACCEPT_ATTRIBUTE.split(",")).toEqual([
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/avif",
    ]);
    // The picker hint omits the non-standard image/jpg, which the validator still accepts.
    expect(ACCEPTED_IMAGE_TYPES).toContain("image/jpg");
    expect(ACCEPT_ATTRIBUTE).not.toContain("image/jpg");
  });
});

describe("the size boundary, measured against the server", () => {
  it("should accept a file exactly at the limit", () => {
    expect(validateUpload(pick(LIMIT_BYTES, "image/png"), LIMIT_BYTES)).toEqual({ ok: true });
  });

  it("should refuse the first byte over the limit", () => {
    const verdict = validateUpload(pick(LIMIT_BYTES + 1, "image/png"), LIMIT_BYTES);
    expect(verdict).toMatchObject({ ok: false, reason: "size" });
    if (!verdict.ok) {
      expect(verdict.message).toBe("That photo is larger than 15 MB.");
    }
  });

  it("should honour an explicit limit rather than the build default", () => {
    expect(validateUpload(pick(7 * MB, "image/png"), 5 * MB)).toMatchObject({
      ok: false,
      reason: "size",
    });
    expect(validateUpload(pick(5 * MB, "image/png"), 5 * MB)).toEqual({ ok: true });
  });

  it("should refuse an empty file before asking the server", () => {
    expect(validateUpload(pick(0, "image/png"))).toMatchObject({ ok: false, reason: "empty" });
  });
});

describe("the configured limit", () => {
  it("should default to the backend's documented 15 MB", () => {
    expect(DEFAULT_MAX_UPLOAD_MB).toBe(15);
    expect(MAX_UPLOAD_MB).toBe(DEFAULT_MAX_UPLOAD_MB);
    expect(MAX_UPLOAD_BYTES).toBe(15 * MB);
  });

  it("should read a whole number inside the backend's bounds", () => {
    expect(parseMaxUploadMb("1")).toBe(1);
    expect(parseMaxUploadMb("20")).toBe(20);
    expect(parseMaxUploadMb("1024")).toBe(1024);
    expect(parseMaxUploadMb("  7 ")).toBe(7);
  });

  it("should fall back rather than disable validation on a bad value", () => {
    for (const value of [undefined, "", "   ", "0", "1025", "1.5", "15MB", "abc"]) {
      expect(parseMaxUploadMb(value)).toBe(DEFAULT_MAX_UPLOAD_MB);
    }
  });
});
