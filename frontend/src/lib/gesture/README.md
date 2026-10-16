Touch and pointer geometry: thresholds, distances, and the rules that turn a gesture into an intent.
Pure functions, no React imports — the hooks that wire them to events live in `src/hooks/`.

The reason the numbers are here rather than inline at the call site: a threshold is a boundary, and a
boundary deserves an edge test on both sides (`pullToRefresh.test.ts`) instead of a magic number that
nobody can measure. E3-S1's silent pull-to-refresh is the first inhabitant; the drag-to-reorder grid
(E5) is expected to add its own slop and long-press timings here rather than inventing a second set.
