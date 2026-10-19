import { useCallback, useMemo } from "react";

import { useDumps } from "../../api/dumps";
import { usePhotos } from "../../api/photos";
import { QuietEmpty, QuietError, QuietLoading } from "../../components/QuietState";
import { buildFeed, entryKey } from "../../lib/feed/model";

import type { Dump, Photo } from "../../types/api";

/**
 * `GET /river` — the chronological feed: every photo and dump in the archive, grouped by month.
 *
 * The view consumes `usePhotos` + `useDumps` and builds the model with `buildFeed` (E5-S1B). Month
 * markers are in display serif; dumps render as titled 6-photo sections; single photos sit between
 * them. The three quiet states are the same trio the splash uses (`components/QuietState.tsx`).
 *
 * What this view does not own: scroll restoration (E5-S1D), the ambient background per dump (E5-S2),
 * image placeholders (E5-S3), and virtualisation (E5-S4).
 */

type RiverState = "loading" | "empty" | "error" | "ready";

function DumpSection({ dump }: { readonly dump: Dump }) {
  return (
    <article className="mb-12">
      {dump.title !== null && (
        <h3 className="mb-4 font-display text-xl tracking-display text-aura-text">{dump.title}</h3>
      )}
      <div className="grid grid-cols-2 gap-2">
        {dump.photos.map((photo) => (
          <img
            key={photo.id}
            src={photo.url}
            alt=""
            loading="lazy"
            decoding="async"
            className="aspect-square w-full rounded-lg object-cover"
          />
        ))}
      </div>
    </article>
  );
}

function SinglePhoto({ photo }: { readonly photo: Photo }) {
  return (
    <div className="mb-8">
      <img
        src={photo.url}
        alt=""
        loading="lazy"
        decoding="async"
        className="w-full rounded-lg object-cover"
      />
    </div>
  );
}

export function RiverView() {
  const photos = usePhotos();
  const dumps = useDumps();

  const isPending = photos.isPending || dumps.isPending;
  const isError = !isPending && (photos.isError || dumps.isError);

  const feed = useMemo(
    () => (photos.data && dumps.data ? buildFeed(photos.data, dumps.data) : []),
    [photos.data, dumps.data],
  );

  const isEmpty = !isPending && !isError && feed.length === 0;

  const state: RiverState = isPending ? "loading" : isError ? "error" : isEmpty ? "empty" : "ready";

  const retry = useCallback(() => {
    void photos.refetch();
    void dumps.refetch();
  }, [photos, dumps]);

  return (
    <main data-state={state} className="relative flex-1 overflow-y-auto bg-aura-bg">
      <h1 className="sr-only">The River</h1>

      {state === "loading" && <QuietLoading />}
      {state === "empty" && <QuietEmpty />}
      {state === "error" && <QuietError onRetry={retry} />}

      {state === "ready" && (
        <div className="mx-auto max-w-lg px-4 py-12">
          {feed.map((month) => (
            <section key={month.key} aria-label={month.label} className="mb-16">
              <h2 className="mb-8 font-display text-2xl tracking-display text-aura-text">
                {month.label}
              </h2>
              {month.entries.map((entry) => {
                const key = entryKey(entry);
                if (entry.kind === "dump") {
                  return <DumpSection key={key} dump={entry.dump} />;
                }
                return <SinglePhoto key={key} photo={entry.photo} />;
              })}
            </section>
          ))}
        </div>
      )}
    </main>
  );
}
