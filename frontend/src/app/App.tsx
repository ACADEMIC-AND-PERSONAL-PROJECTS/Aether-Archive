import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router";

import { RouteFallback } from "./RouteFallback";

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
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path="/" element={<SplashView />} />
        <Route path="/river" element={<RiverView />} />
        <Route path="/curate" element={<WorkshopView />} />
        <Route path="/check" element={<CheckView />} />
      </Routes>
    </Suspense>
  );
}
