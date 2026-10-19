import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RiverView } from "./RiverView";
import { createQueryClient } from "../../app/queryClient";
import globalStyles from "../../styles/global.css?raw";
import { runAxe, violationSummary } from "../../test/axe";

import type { Dump, Photo } from "../../types/api";

/**
 * The River's behaviour, asserted where the user can observe it (E5-S1C).
 *
 * The view consumes two queries (`usePhotos`, `useDumps`) and builds the feed model. The tests stub
 * `globalThis.fetch` to control which endpoint answers what, following the splash's established
 * pattern. The feed model itself is tested in `lib/feed/model.test.ts`; these tests verify the view
 * renders the model correctly and handles the three quiet states.
 *
 * Images have `alt=""` (decorative — the API serves no description), so they are removed from the
 * accessibility tree. Tests that need to find images use `container.querySelectorAll("img")` rather
 * than `screen.getAllByRole("img")`.
 *
 * Error tests use a query client with `retry: false` to avoid waiting for the retry policy's delays.
 * The retry policy has its own tests (`api/retryPolicy.test.ts`); these tests verify the view's
 * reaction to a failed query, not the retry behaviour.
 */

const PHOTO_A: Photo = {
  id: "aaa-1111",
  url: "/images/aaa-1111.jpg",
  category: "pics",
  uploadedAt: "2026-10-15T10:00:00Z",
};

const PHOTO_B: Photo = {
  id: "bbb-2222",
  url: "/images/bbb-2222.jpg",
  category: "anime",
  uploadedAt: "2026-10-10T08:00:00Z",
};

const PHOTO_C: Photo = {
  id: "ccc-3333",
  url: "/images/ccc-3333.jpg",
  category: "pics",
  uploadedAt: "2026-09-20T14:00:00Z",
};

const DUMP_PHOTOS: Photo[] = [
  { id: "d1", url: "/images/d1.jpg", category: "dump", uploadedAt: "2026-10-01T12:00:00Z" },
  { id: "d2", url: "/images/d2.jpg", category: "dump", uploadedAt: "2026-10-01T12:01:00Z" },
  { id: "d3", url: "/images/d3.jpg", category: "dump", uploadedAt: "2026-10-01T12:02:00Z" },
  { id: "d4", url: "/images/d4.jpg", category: "dump", uploadedAt: "2026-10-01T12:03:00Z" },
  { id: "d5", url: "/images/d5.jpg", category: "dump", uploadedAt: "2026-10-01T12:04:00Z" },
  { id: "d6", url: "/images/d6.jpg", category: "dump", uploadedAt: "2026-10-01T12:05:00Z" },
];

const DUMP_TITLED: Dump = {
  id: "dump-1",
  title: "October Memories",
  backgroundColor: "#1a2b3c",
  photos: DUMP_PHOTOS,
  createdAt: "2026-10-05T18:00:00Z",
};

const DUMP_UNTITLED: Dump = {
  id: "dump-2",
  title: null,
  backgroundColor: "#2c3d4e",
  photos: DUMP_PHOTOS,
  createdAt: "2026-09-15T12:00:00Z",
};

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function errorResponse(): Response {
  return new Response(
    JSON.stringify({
      type: "about:blank",
      title: "Internal Server Error",
      status: 500,
      detail: "Something went wrong.",
      code: "internal-failure",
    }),
    { status: 500, headers: { "content-type": "application/problem+json" } },
  );
}

function stubApi(photos: () => Response, dumps: () => Response): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/dumps")) return Promise.resolve(dumps());
    return Promise.resolve(photos());
  });
}

function noRetryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: "always" },
      mutations: { retry: false, networkMode: "always" },
    },
  });
}

function renderRiver(client?: QueryClient) {
  const qc = client ?? createQueryClient();
  return render(
    <MemoryRouter initialEntries={["/river"]}>
      <QueryClientProvider client={qc}>
        <RiverView />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

const mainEl = () => screen.getByRole("main");

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("RiverView — quiet states", () => {
  it("should show the loading state while both queries are pending", () => {
    vi.spyOn(globalThis, "fetch").mockReturnValue(new Promise(() => {}));

    renderRiver();

    expect(mainEl()).toHaveAttribute("data-state", "loading");
    expect(screen.getByTestId("quiet-loading")).toBeInTheDocument();
  });

  it("should show the empty state when the archive has no content", async () => {
    stubApi(
      () => jsonResponse([]),
      () => jsonResponse([]),
    );

    renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "empty"));
    expect(screen.getByTestId("quiet-empty")).toBeInTheDocument();
  });

  it("should show the error state when a query fails", async () => {
    stubApi(
      () => errorResponse(),
      () => jsonResponse([]),
    );

    renderRiver(noRetryClient());

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "error"));
    expect(screen.getByTestId("quiet-error-message")).toBeInTheDocument();
  });

  it("should refetch both queries when retry is clicked", async () => {
    const fetchSpy = stubApi(
      () => errorResponse(),
      () => jsonResponse([]),
    );

    renderRiver(noRetryClient());

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "error"));

    const initialCalls = fetchSpy.mock.calls.length;

    const retryButton = screen.getByRole("button", { name: "Try again" });
    fireEvent.click(retryButton);

    await waitFor(() => expect(fetchSpy.mock.calls.length).toBeGreaterThan(initialCalls));

    const newCalls = fetchSpy.mock.calls.slice(initialCalls);
    const urls = newCalls.map(([input]: [RequestInfo | URL]) =>
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    );
    expect(urls.some((u: string) => u.includes("/photos"))).toBe(true);
    expect(urls.some((u: string) => u.includes("/dumps"))).toBe(true);
  });
});

describe("RiverView — feed rendering", () => {
  it("should keep the River inside a definite viewport scroller", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A, ...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_TITLED]),
    );

    renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    expect(mainEl()).toHaveClass("min-h-0", "overflow-y-auto");
    expect(globalStyles).toMatch(/html\s*{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;/s);
    expect(globalStyles).toMatch(
      /body\s*{[^}]*height:\s*100vh;[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s,
    );
    expect(globalStyles).toMatch(/#root\s*{[^}]*min-height:\s*0;/s);
  });

  it("should restore the River scroll position after navigating away and back", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A, ...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_TITLED]),
    );
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 0;
    });

    function RiverHistory() {
      const navigate = useNavigate();
      return (
        <>
          <button type="button" onClick={() => navigate("/away")}>
            Leave River
          </button>
          <Routes>
            <Route path="/river" element={<RiverView />} />
            <Route
              path="/away"
              element={
                <button type="button" onClick={() => navigate(-1)}>
                  Back to River
                </button>
              }
            />
          </Routes>
        </>
      );
    }

    render(
      <QueryClientProvider client={noRetryClient()}>
        <MemoryRouter initialEntries={["/river"]}>
          <RiverHistory />
        </MemoryRouter>
      </QueryClientProvider>,
    );

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const originalRiver = mainEl();
    let attachedScrollTop = 0;
    Object.defineProperty(originalRiver, "scrollTop", {
      configurable: true,
      get: () => (originalRiver.isConnected ? attachedScrollTop : 0),
      set: (position: number) => {
        attachedScrollTop = position;
      },
    });
    originalRiver.scrollTop = 640;
    fireEvent.scroll(originalRiver);

    fireEvent.click(screen.getByRole("button", { name: "Leave River" }));
    await screen.findByRole("button", { name: "Back to River" });
    expect(originalRiver.isConnected).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Back to River" }));
    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    expect(mainEl()).not.toBe(originalRiver);
    expect(mainEl().scrollTop).toBe(640);
  });

  it("should render month markers in display serif", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A, PHOTO_C, ...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_TITLED]),
    );

    renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const headings = screen.getAllByRole("heading", { level: 2 });
    const labels = headings.map((h) => h.textContent);
    expect(labels).toContain("October 2026");
    expect(labels).toContain("September 2026");

    for (const h of headings) {
      expect(h.className).toContain("font-display");
    }
  });

  it("should render dump sections with title and 6 photos", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A, ...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_TITLED]),
    );

    renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const dumpTitle = screen.getByRole("heading", { level: 3, name: "October Memories" });
    expect(dumpTitle).toBeInTheDocument();
    expect(dumpTitle.className).toContain("font-display");

    const article = dumpTitle.closest("article");
    expect(article).not.toBeNull();
    const dumpImages = article?.querySelectorAll("img") ?? [];
    expect(dumpImages).toHaveLength(6);
  });

  it("should render dump sections without a title heading when title is null", async () => {
    stubApi(
      () => jsonResponse([PHOTO_C, ...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_UNTITLED]),
    );

    const { container } = renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const h3s = screen.queryAllByRole("heading", { level: 3 });
    expect(h3s).toHaveLength(0);

    const images = container.querySelectorAll("img");
    expect(images.length).toBeGreaterThanOrEqual(6);
  });

  it("should render single photos that are not held by any dump", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A, PHOTO_B, ...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_TITLED]),
    );

    const { container } = renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const allImages = [...container.querySelectorAll("img")];
    const singleImageUrls = allImages
      .map((img) => img.getAttribute("src"))
      .filter((src) => src === PHOTO_A.url || src === PHOTO_B.url);
    expect(singleImageUrls).toContain(PHOTO_A.url);
    expect(singleImageUrls).toContain(PHOTO_B.url);
  });

  it("should not duplicate photos held by dumps as singles", async () => {
    const dumpPhoto = DUMP_PHOTOS[0] as Photo;
    stubApi(
      () => jsonResponse([PHOTO_A, dumpPhoto]),
      () => jsonResponse([DUMP_TITLED]),
    );

    const { container } = renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const allImages = [...container.querySelectorAll("img")];
    const matchingDumpPhoto = allImages.filter((img) => img.getAttribute("src") === dumpPhoto.url);
    expect(matchingDumpPhoto).toHaveLength(1);
  });

  it("should set loading and decoding attributes on all images", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A, ...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_TITLED]),
    );

    const { container } = renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const images = container.querySelectorAll("img");
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      expect(img).toHaveAttribute("loading", "lazy");
      expect(img).toHaveAttribute("decoding", "async");
    }
  });
});

describe("RiverView — image loading (E5-S3)", () => {
  it("should set sizes on all images", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A, ...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_TITLED]),
    );

    const { container } = renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const images = container.querySelectorAll("img");
    for (const img of images) {
      expect(img).toHaveAttribute("sizes");
    }
  });

  it("should paint dump photos with the dump's background colour as placeholder", async () => {
    stubApi(
      () => jsonResponse([...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_TITLED]),
    );

    const { container } = renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const article = container.querySelector("[data-dump-id]") as HTMLElement;
    const images = article.querySelectorAll("img");
    for (const img of images) {
      expect(img.style.backgroundColor).not.toBe("");
    }
  });

  it("should give single photos an explicit aspect ratio to prevent CLS", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A]),
      () => jsonResponse([]),
    );

    const { container } = renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const images = container.querySelectorAll("img");
    expect(images.length).toBe(1);
    const img = images[0] as HTMLImageElement;
    expect(img.className).toContain("aspect-");
  });

  it("should hide broken images on error", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A]),
      () => jsonResponse([]),
    );

    const { container } = renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const img = container.querySelector("img") as HTMLImageElement;
    fireEvent.error(img);
    expect(img.style.display).toBe("none");
  });
});

describe("RiverView — accessibility", () => {
  it("should have an accessible heading for assistive technology", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A]),
      () => jsonResponse([]),
    );

    renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const heading = screen.getByRole("heading", { level: 1, name: "The River" });
    expect(heading).toBeInTheDocument();
    expect(heading.className).toContain("sr-only");
  });

  it("should pass the axe accessibility audit", async () => {
    stubApi(
      () => jsonResponse([PHOTO_A, PHOTO_B, ...DUMP_PHOTOS]),
      () => jsonResponse([DUMP_TITLED]),
    );

    const { container } = renderRiver();

    await waitFor(() => expect(mainEl()).toHaveAttribute("data-state", "ready"));

    const results = await runAxe(container);
    expect(violationSummary(results)).toEqual([]);
  });
});
