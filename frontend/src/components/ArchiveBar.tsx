import { Link } from "react-router";

export type ArchiveSection = "river" | "curate";

export interface ArchiveBarProps {
  /** Which destination is the page the reader is on. */
  current: ArchiveSection;
  /** Optional archival counts, shown from `lg`; omitted when a view has not read them. */
  photoCount?: number | undefined;
  dumpCount?: number | undefined;
}

const LINKS: ReadonlyArray<{ section: ArchiveSection; to: string; label: string }> = [
  { section: "river", to: "/river", label: "The River" },
  { section: "curate", to: "/curate", label: "Curate" },
];

function countsSentence(photoCount?: number, dumpCount?: number): string | null {
  const parts: string[] = [];
  if (photoCount !== undefined) {
    parts.push(`${photoCount} ${photoCount === 1 ? "photograph" : "photographs"}`);
  }
  if (dumpCount !== undefined) {
    parts.push(`${dumpCount} ${dumpCount === 1 ? "dump" : "dumps"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * The archive bar shared by every view except the splash.
 *
 * The splash is the front door and stays image-only; once a reader is inside, the bar is the one
 * persistent piece of chrome: the wordmark returns home, the two destinations stay one tap away, and
 * the archival counts sit quietly at the far right. It is ink on every page, so the bar never
 * changes colour with a dump's aura — it is the cover of the book, not a page inside it.
 */
export function ArchiveBar({ current, photoCount, dumpCount }: ArchiveBarProps) {
  const counts = countsSentence(photoCount, dumpCount);

  return (
    <header className="relative z-20 flex shrink-0 items-center justify-between gap-5 border-b border-line bg-ink/90 px-4 py-3 sm:px-6 lg:px-10">
      <Link
        to="/"
        className="group flex items-baseline gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper"
      >
        <span className="font-display text-[1.35rem] leading-none tracking-display text-paper">
          Aether
        </span>
        <span className="text-[0.58rem] uppercase tracking-[0.34em] text-paper/70 transition-colors group-hover:text-paper/70">
          Archive
        </span>
      </Link>

      <nav aria-label="Primary" className="flex items-center gap-5 sm:gap-7">
        {LINKS.map(({ section, to, label }) => {
          const isCurrent = section === current;
          return (
            <Link
              key={section}
              to={to}
              aria-current={isCurrent ? "page" : undefined}
              className={`aether-kicker relative py-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-paper ${
                isCurrent
                  ? "text-paper after:absolute after:inset-x-0 after:bottom-0 after:h-px after:bg-paper"
                  : "text-paper/70 hover:text-paper/80"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>

      {counts ? <p className="aether-kicker hidden text-paper/70 lg:block">{counts}</p> : null}
    </header>
  );
}
