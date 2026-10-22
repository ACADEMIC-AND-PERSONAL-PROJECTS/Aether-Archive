import { type SyntheticEvent, useCallback, useMemo } from "react";

import { useDumps } from "../../api/dumps";
import { usePhotos } from "../../api/photos";
import { QuietEmpty, QuietError, QuietLoading } from "../../components/QuietState";
import { useRiverAura, type DumpAura } from "../../hooks/useRiverAura";
import { useScrollMemory } from "../../hooks/useScrollMemory";
import { buildFeed, entryKey, type FeedEntry } from "../../lib/feed/model";

import type { Dump, Photo } from "../../types/api";

/**
 * `GET /river` — the chronological feed: every photo and dump in the archive, grouped by month.
 *
 * The view consumes `usePhotos` + `useDumps` and builds the model with `buildFeed` (E5-S1B). Month
 * markers are in display serif; dumps render as titled 6-photo sections; single photos sit between
 * them. The three quiet states are the same trio the splash uses (`components/QuietState.tsx`).
 *
 * What this view does not own: virtualisation (E5-S4).
 */

type RiverState = "loading" | "empty" | "error" | "ready";

const DUMP_IMG_SIZES = "(min-width: 64rem) min(54rem, calc(100vw - 25rem)), calc(100vw - 2rem)";
const SINGLE_IMG_SIZES = "(min-width: 64rem) min(54rem, calc(100vw - 18rem)), calc(100vw - 2rem)";

function hideOnError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  img.style.display = "none";
}

function DumpSection({
  dump,
  firstPhotoId,
}: {
  readonly dump: Dump;
  readonly firstPhotoId: string | null;
}) {
  return (
    <article data-dump-id={dump.id} className="mb-20 max-w-[56rem]">
      {dump.title !== null && (
        <h3 className="mb-6 font-display text-2xl tracking-display text-aura-text">{dump.title}</h3>
      )}
      <div data-photo-essay className="flex max-w-3xl flex-col gap-7 sm:gap-9">
        {dump.photos.map((photo, index) => (
          <img
            key={photo.id}
            data-photo-order={index + 1}
            src={photo.url}
            alt=""
            loading={photo.id === firstPhotoId ? "eager" : "lazy"}
            decoding="async"
            sizes={DUMP_IMG_SIZES}
            onError={hideOnError}
            className="aspect-[3/2] w-full rounded-2xl object-contain"
            style={{ backgroundColor: dump.backgroundColor }}
          />
        ))}
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
    <div className="mb-16 max-w-[56rem]">
      <img
        src={photo.url}
        alt=""
        loading={photo.id === firstPhotoId ? "eager" : "lazy"}
        decoding="async"
        sizes={SINGLE_IMG_SIZES}
        onError={hideOnError}
        className="aspect-[3/2] w-full rounded-2xl bg-aura-surface object-contain"
      />
    </div>
  );
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
        <div className="mx-auto w-full max-w-[88rem] px-4 py-10 sm:px-6 sm:py-12 lg:px-12 lg:py-16">
          {feed.map((month) => (
            <section
              key={month.key}
              aria-label={month.label}
              className="mb-20 grid grid-cols-1 items-start gap-5 sm:gap-8 lg:grid-cols-[minmax(8rem,0.18fr)_minmax(0,1fr)] lg:gap-12 xl:gap-16"
            >
              <h2 className="font-display text-lg tracking-display text-aura-muted sm:text-xl lg:sticky lg:top-12 lg:mb-0 lg:pt-1">
                {month.label}
              </h2>
              <div className="min-w-0">
                {month.entries.map((entry) => {
                  const key = entryKey(entry);
                  if (entry.kind === "dump") {
                    return <DumpSection key={key} dump={entry.dump} firstPhotoId={firstPhotoId} />;
                  }
                  return <SinglePhoto key={key} photo={entry.photo} firstPhotoId={firstPhotoId} />;
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
