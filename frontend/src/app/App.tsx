import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

import { RouteFallback } from "./RouteFallback";
import { RouteTransition } from "./RouteTransition";

/**
 * The route table — the whole of the app's structure, and the only place a URL becomes a view.
 *
 * Four routes: the three product views — `/` the splash, `/river` the feed, `/curate` the workshop —
 * and `/check`, the design-system verification page (§10) that renders every token, the type styles
 * and the glass material. Each is a `React.lazy` chunk, so opening the splash does not download the
 * workshop; the shared chunk holds React, the router and the query cache. The named-export form is
 * used because the views export named components, which is the convention everywhere else in this
 * codebase.
 *
 * `App` deliberately does **not** contain the router. `BrowserRouter` is mounted in `main.tsx`, so a
 * test can render this same component under a `MemoryRouter` at any URL — the route smoke test does
 * exactly that (`App.test.tsx`).
 *
 * Since E3-S3 the routes sit inside `RouteTransition`, which owns the entry animation and replays it
 * when the view changes. It is inside the `Suspense` boundary on purpose: a view is a lazy chunk, and
 * the animation belongs to the view that is really there, not to the fallback that precedes it.
 */
const SplashView = lazy(() =>
  import("../features/splash/SplashView").then((module) => ({ default: module.SplashView })),
);
const RiverView = lazy(() =>
  import("../features/river/RiverView").then((module) => ({ default: module.RiverView })),
);
const WorkshopView = lazy(() =>
  import("../features/workshop/WorkshopView").then((module) => ({ default: module.WorkshopView })),
);
const CheckView = lazy(() =>
  import("../features/check/CheckView").then((module) => ({ default: module.CheckView })),
);

/** The views, rendered from the current URL. Wrap in a router; supply the query cache with `AppProviders`. */
export function App() {
  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <RouteTransition>
          <Routes>
            <Route path="/" element={<SplashView />} />
            <Route path="/river" element={<RiverView />} />
            <Route path="/curate" element={<WorkshopView />} />
            <Route path="/check" element={<CheckView />} />
          </Routes>
        </RouteTransition>
      </Suspense>
      {/* A printed sheet has a grain; this one is fixed above every view, menu included. */}
      <div aria-hidden="true" className="aether-grain" />
    </>
  );
}
