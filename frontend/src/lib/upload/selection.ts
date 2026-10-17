import { validateUpload } from "./validation";

/**
 * The multi-select rules, as pure functions (E4-S2A).
 *
 * The screen that uses them keeps only what a DOM cannot: object URLs, the per-file upload state and the
 * queue itself. Everything a test can decide without React is here — how many picked files fit under the
 * cap, which picks the client refuses and the exact words each refusal and summary uses. That split is
 * the frontend rule ("pure logic lives in `lib/` and is unit-tested without React"), and it is also what
 * makes the cap testable at its boundaries instead of through six rendered tiles.
 *
 * ## The cap counts the selection, not the pick
 *
 * **Six is the dump's size** (the River's six-image sections), so six is the most a pick may add. The
 * room is `6 - existing`, and only files that would really become tiles consume it: a file the client
 * refuses (empty, wrong type, too large) is reported on its own and does not shadow a later valid one.
 * That ordering is deliberate — `validateUpload` runs on **every** picked file, as the story requires,
 * and an invalid file is not a photo that was "left out": it was never eligible.
 *
 * ## Why the sentences live here
 *
 * The wording is a decision, not styling. "You can add up to 6 photos at a time — 1 wasn't added." says
 * what happened without a counter badge or a scolding, and the singular/plural switch is easy to get
 * wrong in JSX. Pinning it in a pure function keeps the component from growing a second grammar, and
 * the tests below state each form once.
 */

/** The dump's size, and therefore the hard cap on one selection (`_docs/aether_archive_specs.md`). */
export const MAX_SELECTION = 6;

/** One picked file the client refused before it became a tile. `name` is the file's own, never a path. */
export interface SelectionRefusal {
  readonly name: string;
  readonly message: string;
}

/** What one native pick may add: the files that become tiles, the refusals, and how many overflowed. */
export interface SelectionPlan {
  readonly accepted: readonly File[];
  readonly refused: readonly SelectionRefusal[];
  /** Valid files that did not fit under the cap. They are ignored, and the screen says how many. */
  readonly overCap: number;
}

/**
 * Plans one pick against the current selection size.
 *
 * `existingCount` is the number of tiles already in the grid, so the cap is selection + pick. Every
 * picked file is validated; a refusal is recorded per file (the component shows every one), a valid file
 * takes a slot when one is left, and a valid file with no slot left is counted in `overCap`. The order
 * of the pick is preserved in `accepted`: the queue uploads in the order the user chose the files.
 */
export function planSelection(existingCount: number, picked: readonly File[]): SelectionPlan {
  const accepted: File[] = [];
  const refused: SelectionRefusal[] = [];
  const room = Math.max(0, MAX_SELECTION - Math.max(0, existingCount));
  let overCap = 0;

  for (const file of picked) {
    const validation = validateUpload(file);
    if (!validation.ok) {
      refused.push({ name: file.name, message: validation.message });
      continue;
    }
    if (accepted.length < room) {
      accepted.push(file);
    } else {
      overCap += 1;
    }
  }

  return { accepted, refused, overCap };
}

/**
 * The quiet explanation for picks the cap ignored. One sentence, whichever side of the singular the
 * count lands on — the example in the story uses the singular, and a silent truncation is the one
 * outcome the criterion forbids.
 */
export function capSentence(overCap: number): string {
  const verb = overCap === 1 ? "wasn't" : "weren't";
  return `You can add up to ${MAX_SELECTION} photos at a time — ${overCap} ${verb} added.`;
}

/**
 * One refusal, naming the file it belongs to. Without the name, two refusals in one pick read as the
 * same sentence twice and the user cannot tell which file to replace. A file with no name (a drag or a
 * browser that supplies none) falls back to the message alone rather than an empty prefix.
 */
export function refusalSentence(refusal: SelectionRefusal): string {
  return refusal.name === "" ? refusal.message : `${refusal.name}: ${refusal.message}`;
}

/**
 * Everything one pick has to say, in one ordered list: the per-file refusals first, then the cap
 * explanation. The component joins them for the visible notice and the persistent status region, so the
 * two always read the same words.
 */
export function selectionNotices(plan: SelectionPlan): string[] {
  const notices = plan.refused.map(refusalSentence);
  if (plan.overCap > 0) {
    notices.push(capSentence(plan.overCap));
  }
  return notices;
}

/** The panel's count sentence: "1 photo selected." / "4 photos selected." */
export function selectionSentence(count: number): string {
  return count === 1 ? "1 photo selected." : `${count} photos selected.`;
}

/**
 * The sentence a settled queue leaves behind.
 *
 * Counts are this batch's, not the archive's: "Added 3 photos." is what the action did, and a retry that
 * adds the one failed file says "Added 1 photo." — never a running total the user did not ask for. Both
 * halves appear when both happened, so a partial batch cannot look like a total success.
 */
export function queueSummary(added: number, failed: number): string {
  const sentences: string[] = [];
  if (added > 0) {
    sentences.push(added === 1 ? "Added 1 photo." : `Added ${added} photos.`);
  }
  if (failed > 0) {
    sentences.push(
      failed === 1 ? "1 photo couldn't be added." : `${failed} photos couldn't be added.`,
    );
  }
  return sentences.join(" ");
}
