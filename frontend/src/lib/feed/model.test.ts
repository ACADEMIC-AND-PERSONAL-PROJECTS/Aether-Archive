import { describe, expect, it } from "vitest";

import { buildFeed, entryKey, type FeedMonth } from "./model";

import type { Dump, Photo } from "../../types/api";

/**
 * The feed model (E5-S1B), tested without a renderer.
 *
 * The four promises of the story's grouping criterion are pinned here — UTC month sections newest
 * first, a total stable order inside each month, dumps keeping their six photos while singles are
 * only the photos no dump holds, and no duplicate keys — plus the edges the story names: an empty
 * archive, and the month boundary exact to the second.
 */

function photo(id: string, uploadedAt: string): Photo {
  return { id, url: `/images/${id}.png`, category: "pics", uploadedAt };
}

function dump(
  id: string,
  createdAt: string,
  photos: readonly Photo[],
  title: string | null = null,
): Dump {
  return { id, title, backgroundColor: "#101418", photos, createdAt };
}

/** Every entry key of the model, in order — the no-duplicate-keys witnesses. */
function keysOf(months: readonly FeedMonth[]): string[] {
  return months.flatMap((month) => month.entries.map(entryKey));
}

function instantOf(entry: FeedMonth["entries"][number]): string {
  return entry.at;
}

const LATE_SEPTEMBER = "2026-09-30T23:59:59Z";
const EARLY_OCTOBER = "2026-10-01T00:00:00Z";

describe("buildFeed", () => {
  it("should build nothing from an empty archive", () => {
    expect(buildFeed([], [])).toEqual([]);
  });

  it("should split two instants a second apart into their own months", () => {
    const feed = buildFeed([photo("photo-b", EARLY_OCTOBER), photo("photo-a", LATE_SEPTEMBER)], []);

    expect(feed.map((month) => month.key)).toEqual(["2026-10", "2026-09"]);
    expect(feed.map((month) => month.label)).toEqual(["October 2026", "September 2026"]);
    expect(feed[0]?.entries.map(instantOf)).toEqual([EARLY_OCTOBER]);
    expect(feed[1]?.entries.map(instantOf)).toEqual([LATE_SEPTEMBER]);
  });

  it("should keep a photo in the UTC month its instant names, whatever the local zone", () => {
    // 23:30 UTC on 31 October is already November in any zone east of UTC+0:30; the model must not
    // follow the machine it runs on.
    const feed = buildFeed([photo("photo-a", "2026-10-31T23:30:00Z")], []);

    expect(feed.map((month) => month.key)).toEqual(["2026-10"]);
  });

  it("should group singles by month, newest first inside each", () => {
    const feed = buildFeed(
      [
        photo("photo-c", "2026-09-02T08:00:00Z"),
        photo("photo-a", "2026-10-18T21:00:00Z"),
        photo("photo-b", "2026-10-02T08:00:00Z"),
      ],
      [],
    );

    expect(feed.map((month) => month.key)).toEqual(["2026-10", "2026-09"]);
    expect(feed[0]?.entries.map((entry) => entry.id)).toEqual(["photo-a", "photo-b"]);
    expect(feed[1]?.entries.map((entry) => entry.id)).toEqual(["photo-c"]);
    expect(feed.flatMap((month) => month.entries).map((entry) => entry.kind)).toEqual([
      "photo",
      "photo",
      "photo",
    ]);
  });

  it("should render a dump as one entry holding its six photos in display order", () => {
    const six = Array.from({ length: 6 }, (_, index) =>
      photo(`photo-${index}`, `2026-10-0${index + 1}T10:00:00Z`),
    );
    const feed = buildFeed([], [dump("dump-a", "2026-10-07T09:00:00Z", six, "The trip")]);

    expect(feed).toHaveLength(1);
    const entry = feed[0]?.entries[0];
    expect(entry?.kind).toBe("dump");
    expect(entry?.kind === "dump" && entry.dump.photos).toEqual(six);
  });

  it("should never repeat a photo a dump holds as a single", () => {
    const six = Array.from({ length: 6 }, (_, index) =>
      photo(`held-${index}`, `2026-10-0${index + 1}T10:00:00Z`),
    );
    const single = photo("single-a", "2026-10-04T09:00:00Z");

    const feed = buildFeed([...six, single], [dump("dump-a", "2026-10-07T09:00:00Z", six)]);

    const entries = feed.flatMap((month) => month.entries);
    expect(entries.map(entryKey)).toEqual(["dump:dump-a", "photo:single-a"]);
    // The promise in one line: no key appears twice across the model.
    const keys = keysOf(feed);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("should order a month by instant, fractional seconds included", () => {
    // Text order would put `….500Z` first (`"." < "Z"`); chronology puts it last-uploaded first.
    const feed = buildFeed(
      [photo("photo-a", "2026-10-18T21:00:00.500Z"), photo("photo-b", "2026-10-18T21:00:00Z")],
      [],
    );

    expect(feed[0]?.entries.map((entry) => entry.id)).toEqual(["photo-a", "photo-b"]);
  });

  it("should break exact ties deterministically: a dump before a photo, then id ascending", () => {
    const at = "2026-10-07T09:00:00Z";
    const single = photo("photo-a", at);
    const six = Array.from({ length: 6 }, (_, index) =>
      photo(`held-${index}`, "2026-10-01T10:00:00Z"),
    );

    const feed = buildFeed(
      [single],
      [dump("dump-b", at, six), dump("dump-a", at, six.slice().reverse())],
    );

    expect(feed[0]?.entries.map(entryKey)).toEqual(["dump:dump-a", "dump:dump-b", "photo:photo-a"]);
  });

  it("should build the identical model from the same lists in another order", () => {
    const held0 = photo("held-0", "2026-10-03T08:00:00Z");
    const photos = [
      photo("photo-a", "2026-10-18T21:00:00Z"),
      photo("photo-b", "2026-10-02T08:00:00Z"),
      photo("photo-c", "2026-09-02T08:00:00Z"),
      held0,
    ];
    const dumps = [dump("dump-a", "2026-10-07T09:00:00Z", [held0])];

    expect(buildFeed(photos.slice().reverse(), dumps.slice().reverse())).toEqual(
      buildFeed(photos, dumps),
    );
  });

  it("should ignore a duplicate in the wire: first occurrence wins", () => {
    const first = photo("photo-a", "2026-10-01T09:00:00Z");
    const again = photo("photo-a", "2026-11-01T09:00:00Z");
    const held = photo("held-0", "2026-10-01T10:00:00Z");
    const duplicated = dump("dump-a", "2026-10-07T09:00:00Z", [held]);

    const feed = buildFeed([first, again], [duplicated, { ...duplicated }]);

    const entries = feed.flatMap((month) => month.entries);
    expect(entries.map(entryKey)).toEqual(["dump:dump-a", "photo:photo-a"]);
    expect(entries[1]?.at).toBe(first.uploadedAt);
    expect(feed.map((month) => month.key)).toEqual(["2026-10"]);
  });
});
