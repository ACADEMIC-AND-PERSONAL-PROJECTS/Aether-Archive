import type { Dump, Photo } from "../../types/api";

/**
 * The feed model: what the River renders, built from the two reads with no renderer in sight (E5-S1B).
 *
 * `buildFeed` turns `GET /photos` and `GET /dumps` into month sections, newest first, and carries the
 * four promises the story's grouping criterion names:
 *
 * 1. **Grouped by UTC month.** A section's key is the first seven characters of an instant's ISO-8601
 *    string — its UTC month, with no local timezone in play, so the same archive groups the same way
 *    on every machine. The label is the archive's language ("October 2026").
 * 2. **A total, stable order.** Months descending; inside a month, entries descending by instant. Two
 *    entries at the same instant tie-break deterministically — a dump before a photo, then id
 *    ascending — so the same input always builds the identical model, whatever order the lists arrive
 *    in.
 * 3. **Dumps are sections; singles are what no dump holds.** A photo inside any dump never appears
 *    again as a single entry, and a dump's six photos stay in display order, exactly as the contract
 *    serves them (ADR-011 §3).
 * 4. **No duplicate keys.** An entry is identified by `entryKey` (`kind:id`), and a duplicate in the
 *    wire — the same id twice — is ignored rather than rendered twice: first occurrence wins, so the
 *    feed never repeats a key.
 *
 * What it does not do: no rendering, no per-entry dates, no virtualisation (E5-S4 measures that) and
 * no pagination (ADR-025). It is built from whole lists and knows nothing of the network.
 */

/** The kinds an entry can wear; the prefix keeps `entryKey` unique even if the sources ever collided. */
export type FeedEntryKind = "dump" | "photo";

/** One dated entry of the feed: a dump section or a single photo, with its identity and instant. */
export type FeedEntry =
  | {
      readonly kind: "dump";
      /** The dump's id — the entry's identity. */
      readonly id: string;
      /** The dump's publication instant, ISO-8601 UTC, as served. */
      readonly at: string;
      readonly dump: Dump;
    }
  | {
      readonly kind: "photo";
      /** The photo's id — the entry's identity. */
      readonly id: string;
      /** The photo's upload instant, ISO-8601 UTC, as served. */
      readonly at: string;
      readonly photo: Photo;
    };

/** One month of the feed: its marker and its entries, newest first. */
export interface FeedMonth {
  /** The UTC month, `YYYY-MM`. */
  readonly key: string;
  /** The marker's text, e.g. `October 2026` (the archive's language). */
  readonly label: string;
  readonly entries: readonly FeedEntry[];
}

/** The React key of an entry — unique across the whole model by construction. */
export function entryKey(entry: FeedEntry): string {
  return `${entry.kind}:${entry.id}`;
}

/** The UTC month of an ISO-8601 instant: its first seven characters. */
function monthKey(at: string): string {
  return at.slice(0, 7);
}

/** The formatter every marker shares (creating one per call is needlessly expensive). */
const MONTH_LABEL = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function monthLabel(key: string): string {
  return MONTH_LABEL.format(new Date(`${key}-01T00:00:00Z`));
}

/**
 * The total order inside a month (promise 2): later first; at the same instant, a dump before a
 * photo, then id ascending. `Date.parse` rather than string comparison on purpose — the archive
 * serves fractional seconds, and `….500Z` sorts before `…Z` as text although it is later.
 */
function compareEntries(a: FeedEntry, b: FeedEntry): number {
  const byInstant = Date.parse(b.at) - Date.parse(a.at);
  if (byInstant !== 0) return byInstant;
  if (a.kind !== b.kind) return a.kind === "dump" ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * The River's model: every month section of the archive, newest first.
 *
 * Pure — two lists in, one readonly model out, no React and no cache. Ordering is the model's promise
 * and not the wire's (ADR-025 §3), so it re-sorts deliberately.
 */
export function buildFeed(photos: readonly Photo[], dumps: readonly Dump[]): readonly FeedMonth[] {
  // The photos dumps hold render inside their section and never again as singles (promise 3).
  const held = new Set<string>();
  for (const dump of dumps) {
    for (const photo of dump.photos) held.add(photo.id);
  }

  // A duplicate id in the wire is ignored, first occurrence wins (promise 4).
  const seen = new Set<string>();
  const entries: FeedEntry[] = [];

  for (const dump of dumps) {
    const entry: FeedEntry = { kind: "dump", id: dump.id, at: dump.createdAt, dump };
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  for (const photo of photos) {
    if (held.has(photo.id)) continue;
    const entry: FeedEntry = { kind: "photo", id: photo.id, at: photo.uploadedAt, photo };
    const key = entryKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }

  const months = new Map<string, FeedEntry[]>();
  for (const entry of entries) {
    const key = monthKey(entry.at);
    const bucket = months.get(key);
    if (bucket === undefined) months.set(key, [entry]);
    else bucket.push(entry);
  }

  return [...months.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([key, bucket]) => ({
      key,
      label: monthLabel(key),
      entries: [...bucket].sort(compareEntries),
    }));
}
