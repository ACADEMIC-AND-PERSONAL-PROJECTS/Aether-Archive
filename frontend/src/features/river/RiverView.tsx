import { type ReactNode, type SyntheticEvent, useCallback, useMemo } from "react";
import { Link } from "react-router";

import { useDumps } from "../../api/dumps";
import { usePhotos } from "../../api/photos";
import { ArchiveBar } from "../../components/ArchiveBar";
import { QuietEmpty, QuietError, QuietLoading } from "../../components/QuietState";
import { useRiverAura, type DumpAura } from "../../hooks/useRiverAura";
import { useScrollMemory } from "../../hooks/useScrollMemory";
import { buildFeed, entryKey, type FeedEntry } from "../../lib/feed/model";

import type { Dump, Photo } from "../../types/api";

/**
 * `GET /river` — the chronological feed: every photo and dump in the archive, grouped by month.
 *
 * The view consumes `usePhotos` + `useDumps` and builds the model with `buildFeed` (E5-S1B). Each
 * month is an editorial chapter: a sticky month rail, dumps as titled spreads with one hero frame
 * and five plates, and consecutive singles gathered into a contact sheet. The three quiet states are
 * the same trio the splash uses (`components/QuietState.tsx`).
 *
 * The feed order is untouched: a dump stays a section, and a photo inside a dump never reappears as
 * a single. Only the *presentation* of consecutive singles changes — they share a grid instead of
 * each taking a full row.
 *
 * What this view does not own: virtualisation (E5-S4).
 */

type RiverState = "loading" | "empty" | "error" | "ready";

const DUMP_IMG_SIZES =
  "(min-width: 80rem) 60rem, (min-width: 64rem) calc(100vw - 24rem), calc(100vw - 2rem)";
const SINGLE_IMG_SIZES =
  "(min-width: 64rem) calc(33vw - 4rem), (min-width: 40rem) calc(50vw - 2rem), calc(100vw - 2rem)";

function hideOnError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  img.style.display = "none";
}

function DumpSection({
  dump,
  firstPhotoId,
  index,
}: {
  readonly dump: Dump;
  readonly firstPhotoId: string | null;
  readonly index: number;
}) {
  return (
    <article data-dump-id={dump.id} className="mb-24 last:mb-0 lg:mb-28">
      <header className="mb-7 flex flex-col gap-5 border-t border-aura-text/15 pt-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="aether-kicker text-aura-text/45">
            Dump {String(index + 1).padStart(2, "0")} · {dump.photos.length} photographs
          </p>
          {dump.title !== null && (
            <h3 className="mt-2 max-w-3xl font-display text-2xl tracking-display text-aura-text sm:text-3xl">
              {dump.title}
            </h3>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2.5 pb-1">
          <span
            aria-hidden="true"
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: dump.backgroundColor }}
          />
          <span className="aether-kicker text-aura-text/40">{dump.backgroundColor}</span>
        </div>
      </header>

      {/* The first frame is the spread's hero: it spans both columns; the other five sit in a
          2-column plate grid. The essay stays a flex column so the vertical reading order — and the
          contract tested in E6-S26 — is unchanged. */}
      <div data-photo-essay className="flex max-w-5xl flex-col gap-3 sm:gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
          {dump.photos.map((photo, photoIndex) => (
            <img
              key={photo.id}
              data-photo-order={photoIndex + 1}
              src={photo.url}
              alt=""
              loading={photo.id === firstPhotoId ? "eager" : "lazy"}
              decoding="async"
              sizes={DUMP_IMG_SIZES}
              onError={hideOnError}
              className={`aspect-[3/2] w-full rounded-[2px] object-contain ${
                photoIndex === 0 ? "sm:col-span-2" : ""
              }`}
              style={{ backgroundColor: dump.backgroundColor }}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

function SinglePhoto({
  photo,
  firstPhotoId,
}: {
  readonly photo: Photo;
  readonly firstPhotoId: string | null;
}) {
  return (
    <div className="group relative overflow-hidden rounded-[2px] bg-aura-surface">
      <img
        src={photo.url}
        alt=""
        loading={photo.id === firstPhotoId ? "eager" : "lazy"}
        decoding="async"
        sizes={SINGLE_IMG_SIZES}
        onError={hideOnError}
        className="aspect-[3/2] w-full object-contain transition-transform duration-[var(--motion-duration-slow)] group-hover:scale-[1.01]"
      />
    </div>
  );
}

/** The chapter heading: the month name in display serif, the year as a small-caps line. Splitting
 * them lets the name sit on one line even in the narrow rail — the body's `overflow-wrap` would
 * otherwise break "October" mid-word. The h2's text is still exactly the feed's label. */
function MonthHeading({ label }: { readonly label: string }) {
  const [name = label, ...yearParts] = label.split(" ");
  const year = yearParts.join(" ");

  return (
    <h2 className="mt-3 break-normal font-display text-2xl tracking-display text-aura-text sm:text-3xl">
      <span className="block">{name}</span>{" "}
      {year !== "" ? (
        <span className="mt-1 block font-ui text-xs uppercase tracking-[0.3em] text-aura-text/45">
          {year}
        </span>
      ) : null}
    </h2>
  );
}

/** Consecutive singles share one contact sheet; a dump flushes the sheet and starts a spread. */
function MonthEntries({
  entries,
  firstPhotoId,
}: {
  readonly entries: readonly FeedEntry[];
  readonly firstPhotoId: string | null;
}) {
  const blocks: ReactNode[] = [];
  let batch: Photo[] = [];
  let dumpIndex = 0;

  const flushSingles = (): void => {
    if (batch.length === 0) {
      return;
    }
    const first = batch[0];
    if (first === undefined) {
      return;
    }
    blocks.push(
      <div
        key={`photos-${first.id}`}
        className="mb-16 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3"
      >
        {batch.map((photo) => (
          <SinglePhoto key={photo.id} photo={photo} firstPhotoId={firstPhotoId} />
        ))}
      </div>,
    );
    batch = [];
  };

  for (const entry of entries) {
    if (entry.kind === "photo") {
      batch.push(entry.photo);
      continue;
    }
    flushSingles();
    blocks.push(
      <DumpSection
        key={entryKey(entry)}
        dump={entry.dump}
        firstPhotoId={firstPhotoId}
        index={dumpIndex}
      />,
    );
    dumpIndex += 1;
  }
  flushSingles();

  return <>{blocks}</>;
}

export function RiverView() {
  const {
    data: photoData,
    isPending: photosPending,
    isError: photosError,
    refetch: refetchPhotos,
  } = usePhotos();
  const {
    data: dumpData,
    isPending: dumpsPending,
    isError: dumpsError,
    refetch: refetchDumps,
  } = useDumps();

  const isPending = photosPending || dumpsPending;
  const isError = !isPending && (photosError || dumpsError);

  const feed = useMemo(
    () => (photoData && dumpData ? buildFeed(photoData, dumpData) : []),
    [photoData, dumpData],
  );
  const firstPhotoId = useMemo(() => {
    for (const month of feed) {
      for (const entry of month.entries) {
        if (entry.kind === "photo") {
          return entry.photo.id;
        }
        const firstDumpPhoto = entry.dump.photos[0];
        if (firstDumpPhoto !== undefined) {
          return firstDumpPhoto.id;
        }
      }
    }
    return null;
  }, [feed]);

  const isEmpty = !isPending && !isError && feed.length === 0;

  const state: RiverState = isPending ? "loading" : isError ? "error" : isEmpty ? "empty" : "ready";

  const scrollRef = useScrollMemory("river", state === "ready");

  const dumpAuras: readonly DumpAura[] = useMemo(
    () =>
      feed.flatMap((month) =>
        month.entries
          .filter((e): e is Extract<FeedEntry, { kind: "dump" }> => e.kind === "dump")
          .map((e) => ({ id: e.dump.id, backgroundColor: e.dump.backgroundColor })),
      ),
    [feed],
  );

  useRiverAura(scrollRef, dumpAuras);

  const retry = useCallback(() => {
    void refetchPhotos();
    void refetchDumps();
  }, [refetchPhotos, refetchDumps]);

  return (
    <>
      <ArchiveBar current="river" photoCount={photoData?.length} dumpCount={dumpData?.length} />
      <main
        ref={scrollRef}
        data-state={state}
        data-aura-transition
        className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain bg-aura-bg text-aura-text"
      >
        <h1 className="sr-only">The River</h1>

        {state === "loading" && <QuietLoading />}
        {state === "empty" && <QuietEmpty />}
        {state === "error" && <QuietError onRetry={retry} />}

        {state === "ready" && (
          <div className="mx-auto w-full max-w-[96rem] px-4 py-10 sm:px-6 sm:py-14 lg:px-12 lg:py-20">
            {feed.map((month, monthIndex) => (
              <section
                key={month.key}
                aria-label={month.label}
                className="mb-24 grid grid-cols-1 items-start gap-6 last:mb-0 sm:gap-8 lg:mb-32 lg:grid-cols-[minmax(14rem,0.2fr)_minmax(0,1fr)] lg:gap-16 xl:gap-24"
              >
                <div className="lg:sticky lg:top-8 lg:self-start">
                  <p className="aether-kicker text-aura-text/45">
                    {String(monthIndex + 1).padStart(2, "0")} /{" "}
                    {String(feed.length).padStart(2, "0")}
                  </p>
                  <MonthHeading label={month.label} />
                  <div className="mt-5 h-px w-12 bg-aura-text/25" />
                  <p className="aether-kicker mt-4 hidden text-aura-text/40 lg:block">
                    {month.entries.length} {month.entries.length === 1 ? "entry" : "entries"}
                  </p>
                </div>

                <div className="min-w-0">
                  <MonthEntries entries={month.entries} firstPhotoId={firstPhotoId} />
                </div>
              </section>
            ))}

            <footer className="mt-24 flex flex-col gap-6 border-t border-aura-text/15 pt-8 sm:flex-row sm:items-end sm:justify-between">
              <p className="aether-kicker text-aura-text/40">End of the river</p>
              <Link
                to="/curate"
                className="group inline-flex items-center gap-3 font-display text-xl tracking-display text-aura-text transition-colors hover:text-aura-text/70 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-aura-text"
              >
                Curate a dump
                <span
                  aria-hidden="true"
                  className="text-base transition-transform duration-[var(--motion-duration-quick)] group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            </footer>
          </div>
        )}
      </main>
    </>
  );
}
