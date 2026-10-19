#!/usr/bin/env node
/**
 * E5-S1A probe — the JSON weight of reading the archive whole (ADR-025).
 *
 * The River fetches `GET /photos` and `GET /dumps` in full. This script measures what that costs on
 * the wire for a plausible mature archive: 300 photos, and 60 dumps each embedding its six photos
 * (the contract's `Dump.photos`). Only the JSON is measured — image bytes are separate per-`<img>`
 * requests and are not part of the feed's payload.
 *
 * Deterministic: synthetic ids are the length of the uuids the archive serves, titles are typical
 * lengths, instants span ~58 days. Run from the repository root:
 *
 *   node reports/probes/e5-s1a-feed-payload.mjs
 */

import { gzipSync } from "node:zlib";

const PHOTO_COUNT = 300;
const DUMP_COUNT = 60;

const CATEGORIES = ["pics", "anime", "dump", "uncategorized"];
const TITLES = [
  "Late summer, the coast",
  "Kyoto in the rain",
  "Night walks",
  null,
  "Studio light tests",
  "The blue hour",
];

function id(n) {
  const hex = n.toString(16).padStart(12, "0");
  return `a0b1c2d3-e4f5-4a6b-8c7d-${hex}`;
}

/** 2026-10-18T12:00:00Z going back 17,000 s (~4.7 h) per step. */
function iso(n) {
  const base = Date.UTC(2026, 9, 18, 12, 0, 0);
  return new Date(base - n * 17_000 * 1000).toISOString();
}

const photos = Array.from({ length: PHOTO_COUNT }, (_, n) => ({
  id: id(n),
  url: `/images/${id(n)}.png`,
  category: CATEGORIES[n % CATEGORIES.length],
  uploadedAt: iso(n),
}));

const dumps = Array.from({ length: DUMP_COUNT }, (_, n) => ({
  id: id(1000 + n),
  title: TITLES[n % TITLES.length],
  backgroundColor: `#${((n * 2654435761) % 0xffffff).toString(16).padStart(6, "0")}`,
  photos: Array.from({ length: 6 }, (_, k) => photos[(n * 6 + k) % PHOTO_COUNT]),
  createdAt: iso(n),
}));

const payload = JSON.stringify({ photos, dumps });
const gzipped = gzipSync(payload);

const kb = (bytes) => Number((bytes / 1024).toFixed(1));

console.log(
  JSON.stringify(
    {
      photos: PHOTO_COUNT,
      dumps: DUMP_COUNT,
      json_bytes: payload.length,
      json_kb: kb(payload.length),
      gzip_bytes: gzipped.length,
      gzip_kb: kb(gzipped.length),
    },
    null,
    2,
  ),
);
