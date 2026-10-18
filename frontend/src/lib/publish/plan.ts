import { orderedIds } from "../ordering/move";
import { MAX_SELECTION } from "../upload/selection";

import type { DumpCreate, Photo } from "../../types/api";

/**
 * The publish plan, as a pure function (E4-S5B).
 *
 * `POST /api/v1/dumps` takes a title (optional), a `#RRGGBB` background and exactly six distinct,
 * uncurated photo ids in display order (ADR-011 §3). The workshop holds the draft; this module turns
 * it into a request body — or refuses it, in one sentence, before anything is sent. The checks mirror
 * the server's, in the order the draft can fail them: six tiles, every one stored, the six photos
 * distinct, an aura chosen (and a `#RRGGBB` one), and a title within 80 characters.
 *
 * ## The ids are the stored photos' ids
 *
 * The tiles are the draft: `items` arrives in display order and each tile carries the archive `Photo`
 * its upload returned (E4-S5A). `orderedIds` maps each item's `id` field, so the plan first projects
 * the tiles onto their photos — `photo.id` in the same order — and `displayOrder` is the index, 0–5.
 * The ready plan also returns those photos, in order, so the optimistic dump can show the six before
 * the server answers (E4-S5C).
 *
 * ## Why the sentences live here
 *
 * ADR-024 decision 2: a refused click is answered with one sentence, not a disabled button. The
 * wording is a decision, and the singular/plural switch is easy to get wrong in JSX, so it is pinned
 * in `plan.test.ts` once per form — the split `lib/upload/selection.ts` uses for the pick.
 */

/** The dump's size: six photos, the River's sections. `MAX_SELECTION` caps one pick at the same six. */
export const DUMP_PHOTO_COUNT = MAX_SELECTION;

/** What the plan reads from one tile: the archive photo it stored, or null while it has none. */
export interface PublishCandidate {
  readonly photo: Photo | null;
}

/**
 * A publish plan: the body to send and the photos it names, or the one sentence that refuses it.
 *
 * `photos` is the draft in display order — the same six photos `body.photoIds` names — so the
 * optimistic insert can build its `Dump` without re-reading the grid.
 */
export type PublishPlan =
  | {
      readonly status: "ready";
      readonly body: DumpCreate;
      readonly photos: readonly Photo[];
    }
  | { readonly status: "blocked"; readonly sentence: string };

/** The server's `@Pattern` for `backgroundColor` (`ValidationConstraints`), case-insensitively. */
const HEX = /^#[0-9a-fA-F]{6}$/;

/** The server's `@Size` limit for the title (`ValidationConstraints.TITLE_MAX_LENGTH`). */
const TITLE_MAX_LENGTH = 80;

function blocked(sentence: string): PublishPlan {
  return { status: "blocked", sentence };
}

/**
 * Plans a publish from the draft, the chosen aura and the title field's raw value.
 *
 * Returns the first refusal only: one sentence is what the panel shows, and a list of everything
 * wrong with a draft reads as a scolding rather than a next step. The title is trimmed before it is
 * counted and sent — blank reads as `null` — so the server's 80-character check applies to exactly
 * the string it receives (ADR-011 §2, ADR-024 decision 3).
 */
export function planPublish(
  items: readonly PublishCandidate[],
  aura: string | null,
  title: string,
): PublishPlan {
  if (items.length !== DUMP_PHOTO_COUNT) {
    return blocked(
      `A dump needs exactly ${DUMP_PHOTO_COUNT} photos — this draft holds ${items.length}.`,
    );
  }

  const photos: Photo[] = [];
  let unStored = 0;
  for (const item of items) {
    if (item.photo === null) {
      unStored += 1;
    } else {
      photos.push(item.photo);
    }
  }
  if (unStored > 0) {
    return blocked(
      unStored === 1
        ? "1 photo isn't stored yet — upload it before saving."
        : `${unStored} photos aren't stored yet — upload them before saving.`,
    );
  }

  const photoIds = orderedIds(photos);
  if (new Set(photoIds).size !== photoIds.length) {
    return blocked("The draft repeats a photo — remove the duplicate before saving.");
  }

  if (aura === null || !HEX.test(aura)) {
    return blocked("Choose an aura before saving.");
  }

  const trimmedTitle = title.trim();
  if (trimmedTitle.length > TITLE_MAX_LENGTH) {
    return blocked(
      `The title is ${trimmedTitle.length} characters — the limit is ${TITLE_MAX_LENGTH}.`,
    );
  }

  return {
    status: "ready",
    body: {
      title: trimmedTitle === "" ? null : trimmedTitle,
      backgroundColor: aura,
      photoIds,
    },
    photos,
  };
}
