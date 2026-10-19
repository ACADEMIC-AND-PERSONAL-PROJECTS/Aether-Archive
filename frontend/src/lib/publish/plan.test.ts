import { describe, expect, it } from "vitest";

import { DUMP_PHOTO_COUNT, planPublish, type PublishCandidate, type PublishPlan } from "./plan";

import type { Photo } from "../../types/api";

/**
 * The publish plan (E4-S5B), tested without a renderer.
 *
 * The plan is the client's mirror of the server's checks (ADR-024 decision 3): exactly six tiles,
 * every one stored, the six photos distinct, an aura, and a title within 80 characters — refused in
 * that order, one sentence each. The ids are the stored photos' ids in display order; `displayOrder`
 * is the index. Every sentence and both boundaries (six, 80) are pinned once below.
 */

function photo(id: string): Photo {
  return {
    id,
    url: `/images/${id}.png`,
    category: "uncategorized",
    uploadedAt: "2026-10-18T21:00:00Z",
  };
}

/** A draft in display order; a `null` id is a tile whose upload has not stored a photo yet. */
function draft(...ids: readonly (string | null)[]): PublishCandidate[] {
  return ids.map((id) => ({ photo: id === null ? null : photo(id) }));
}

const SIX = ["photo-a", "photo-b", "photo-c", "photo-d", "photo-e", "photo-f"];

function ready(plan: PublishPlan): Extract<PublishPlan, { status: "ready" }> {
  if (plan.status !== "ready") {
    throw new Error(`expected a ready plan, got: ${plan.sentence}`);
  }
  return plan;
}

describe("a publishable draft", () => {
  it("should send the six stored photos' ids in display order", () => {
    const plan = ready(planPublish(draft(...SIX), "#1f7a7a", "Summer"));

    expect(plan.body.photoIds).toEqual(SIX);
    expect(DUMP_PHOTO_COUNT).toBe(6);
    expect(plan.body.backgroundColor).toBe("#1f7a7a");
    expect(plan.body.title).toBe("Summer");
    expect(plan.photos.map((stored) => stored.id)).toEqual(SIX);
  });

  it("should follow the draft's order, not the ids' order", () => {
    const reversed = [...SIX].reverse();

    const plan = ready(planPublish(draft(...reversed), "#c2542a", ""));

    expect(plan.body.photoIds).toEqual(reversed);
  });

  it("should read a blank or whitespace title as null", () => {
    expect(ready(planPublish(draft(...SIX), "#1f7a7a", "")).body.title).toBeNull();
    expect(ready(planPublish(draft(...SIX), "#1f7a7a", " \n\t ")).body.title).toBeNull();
    // `.trim()` removes U+00A0 too; a pasted no-break space is still a blank title.
    expect(ready(planPublish(draft(...SIX), "#1f7a7a", "\u00A0")).body.title).toBeNull();
  });

  it("should trim the title it sends", () => {
    const plan = ready(planPublish(draft(...SIX), "#1f7a7a", "  Summer  "));

    expect(plan.body.title).toBe("Summer");
  });

  it("should accept exactly 80 characters, counted after trimming", () => {
    const title = "t".repeat(80);

    const plan = ready(planPublish(draft(...SIX), "#1f7a7a", `${title}   `));

    expect(plan.body.title).toBe(title);
  });

  it("should count UTF-16 units, as the server's @Size does", () => {
    // A surrogate pair is two units in both JS `.length` and Java's `String.length()`; 40 emoji fit
    // exactly under the limit, 41 do not. A code-point count would let one through the client and
    // have the server refuse it.
    expect(ready(planPublish(draft(...SIX), "#1f7a7a", "🙂".repeat(40))).body.title).toBe(
      "🙂".repeat(40),
    );
    expect(planPublish(draft(...SIX), "#1f7a7a", "🙂".repeat(41))).toEqual({
      status: "blocked",
      sentence: "The title is too long — the limit is 80.",
    });
  });

  it("should pass an uppercase hex through as typed", () => {
    const plan = ready(planPublish(draft(...SIX), "#A1B2C3", "Summer"));

    expect(plan.body.backgroundColor).toBe("#A1B2C3");
  });
});

describe("refusals", () => {
  it("should refuse a draft that isn't six tiles", () => {
    const five = planPublish(draft(...SIX.slice(0, 5)), "#1f7a7a", "");
    const seven = planPublish(draft(...SIX, "photo-g"), "#1f7a7a", "");

    expect(five).toEqual({
      status: "blocked",
      sentence: "A dump needs exactly 6 photos — this draft holds 5.",
    });
    expect(seven).toEqual({
      status: "blocked",
      sentence: "A dump needs exactly 6 photos — this draft holds 7.",
    });
  });

  it("should refuse a photo that isn't stored yet, in the singular and the plural", () => {
    const one = planPublish(draft(...SIX.slice(0, 5), null), "#1f7a7a", "");
    const two = planPublish(draft(...SIX.slice(0, 4), null, null), "#1f7a7a", "");

    expect(one).toEqual({
      status: "blocked",
      sentence: "1 photo isn't stored yet — upload it before saving.",
    });
    expect(two).toEqual({
      status: "blocked",
      sentence: "2 photos aren't stored yet — upload them before saving.",
    });
  });

  it("should refuse a draft that repeats a photo", () => {
    const plan = planPublish(
      draft("photo-a", "photo-b", "photo-c", "photo-d", "photo-e", "photo-a"),
      "#1f7a7a",
      "",
    );

    expect(plan).toEqual({
      status: "blocked",
      sentence: "The draft repeats a photo — remove the duplicate before saving.",
    });
  });

  it("should refuse before an aura is chosen or while it isn't a #RRGGBB triple", () => {
    for (const aura of [
      null,
      "",
      "1f7a7a",
      "#1f7a",
      "#12345g",
      "#1234567",
      " #1f7a7a ",
      "#1f7a7a\n",
    ]) {
      expect(planPublish(draft(...SIX), aura, "")).toEqual({
        status: "blocked",
        sentence: "Choose an aura before saving.",
      });
    }
  });

  it("should refuse a title over 80 characters", () => {
    const plan = planPublish(draft(...SIX), "#1f7a7a", `  ${"t".repeat(81)}  `);

    expect(plan).toEqual({
      status: "blocked",
      sentence: "The title is too long — the limit is 80.",
    });
  });

  it("should report the first refusal in the draft's order", () => {
    // Five tiles and no aura: the count is the first thing the draft is missing.
    expect(planPublish(draft(...SIX.slice(0, 5)), null, "t".repeat(81))).toEqual({
      status: "blocked",
      sentence: "A dump needs exactly 6 photos — this draft holds 5.",
    });
    // Five tiles, one of them un-stored: the count still comes before the un-stored photo.
    expect(
      planPublish(draft("photo-a", "photo-b", "photo-c", "photo-d", null), "#1f7a7a", ""),
    ).toEqual({
      status: "blocked",
      sentence: "A dump needs exactly 6 photos — this draft holds 5.",
    });
    // Five stored tiles, one of them repeated: the count still comes before distinctness.
    expect(
      planPublish(draft("photo-a", "photo-a", "photo-c", "photo-d", "photo-e"), "#1f7a7a", ""),
    ).toEqual({
      status: "blocked",
      sentence: "A dump needs exactly 6 photos — this draft holds 5.",
    });
    // Six tiles, one un-stored, no aura: the un-stored photo comes before the colour.
    expect(planPublish(draft(...SIX.slice(0, 5), null), null, "")).toEqual({
      status: "blocked",
      sentence: "1 photo isn't stored yet — upload it before saving.",
    });
    // One un-stored photo AND a duplicate: the un-stored photo comes before distinctness.
    expect(
      planPublish(
        draft("photo-a", "photo-a", "photo-c", "photo-d", "photo-e", null),
        "#1f7a7a",
        "",
      ),
    ).toEqual({
      status: "blocked",
      sentence: "1 photo isn't stored yet — upload it before saving.",
    });
    // A duplicate AND no aura: distinctness comes before the colour.
    expect(
      planPublish(
        draft("photo-a", "photo-b", "photo-c", "photo-d", "photo-e", "photo-a"),
        null,
        "",
      ),
    ).toEqual({
      status: "blocked",
      sentence: "The draft repeats a photo — remove the duplicate before saving.",
    });
    // Six stored, no aura, an over-long title: the colour comes before the title.
    expect(planPublish(draft(...SIX), null, "t".repeat(81))).toEqual({
      status: "blocked",
      sentence: "Choose an aura before saving.",
    });
  });
});
