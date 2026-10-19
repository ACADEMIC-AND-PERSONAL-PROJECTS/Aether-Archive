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

const DUMP_IMG_SIZES =
  "(min-width: 64rem) min(22rem, calc((100vw - 25rem) / 3)), calc((100vw - 2.5rem) / 2)";
const SINGLE_IMG_SIZES = "(min-width: 64rem) min(42rem, calc(100vw - 25rem)), calc(100vw - 2.5rem)";

function hideOnError(e: SyntheticEvent<HTMLImageElement>): void {
  const img = e.currentTarget;
  img.style.display = "none";
}

function DumpSection({ dump }: { readonly dump: Dump }) {
  return (
    <article data-dump-id={dump.id} className="mb-14">
      {dump.title !== null && (
        <h3 className="mb-4 font-display text-xl tracking-display text-aura-text sm:text-2xl">
          {dump.title}
        </h3>
      )}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
        {dump.photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.url}
            alt=""
            loading="lazy"
            decoding="async"
            sizes={DUMP_IMG_SIZES}
            onError={hideOnError}
            className="aspect-square w-full rounded-xl object-cover"
            style={{ backgroundColor: dump.backgroundColor }}
          />
        ))}
      </div>
    </article>
  );
}

function SinglePhoto({ photo }: { readonly photo: Photo }) {
  return (
    <div className="mb-10 lg:max-w-2xl">
      <img
        src={photo.url}
        alt=""
        loading="lazy"
        decoding="async"
        sizes={SINGLE_IMG_SIZES}
        onError={hideOnError}
        className="aspect-[3/4] w-full rounded-xl object-cover bg-aura-surface"
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
              className="mb-20 grid grid-cols-1 items-start gap-6 sm:gap-8 lg:grid-cols-[minmax(10rem,0.24fr)_minmax(0,1fr)] lg:gap-12 xl:gap-16"
            >
              <h2 className="font-display text-2xl tracking-display text-aura-text lg:sticky lg:top-12 lg:mb-0 lg:pt-1">
                {month.label}
              </h2>
              <div className="min-w-0">
                {month.entries.map((entry) => {
                  const key = entryKey(entry);
                  if (entry.kind === "dump") {
                    return <DumpSection key={key} dump={entry.dump} />;
                  }
                  return <SinglePhoto key={key} photo={entry.photo} />;
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
