/**
 * E5-S4 probe — profile the River with a 300-item and a 600-item feed.
 *
 * Measures: total DOM nodes, img count, render time (jsdom — not real browser paint).
 * The numbers feed ADR-027's virtualisation decision.
 *
 * Run: `npm run test -- --run RiverView.profile`
 * Committed to: `reports/probes/e5-s4-virtualisation-profile.test.tsx` (copy)
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RiverView } from "./RiverView";

import type { Dump, Photo } from "../../types/api";

function makePhoto(i: number, month: number): Photo {
  const mm = String(month).padStart(2, "0");
  return {
    id: `photo-${i}`,
    url: `/images/photo-${i}.jpg`,
    category: "pics",
    uploadedAt: `2026-${mm}-${String((i % 28) + 1).padStart(2, "0")}T12:00:00Z`,
  };
}

function makeDump(i: number, month: number): Dump {
  const mm = String(month).padStart(2, "0");
  const photos: Photo[] = Array.from({ length: 6 }, (_, j) => ({
    id: `dump-${i}-photo-${j}`,
    url: `/images/dump-${i}-photo-${j}.jpg`,
    category: "dump" as const,
    uploadedAt: `2026-${mm}-15T${String(j).padStart(2, "0")}:00:00Z`,
  }));
  return {
    id: `dump-${i}`,
    title: i % 3 === 0 ? null : `Dump ${i}`,
    backgroundColor: `#${String(i * 7 + 30).padStart(2, "0")}4050`,
    photos,
    createdAt: `2026-${mm}-15T00:00:00Z`,
  };
}

function buildDataset(singleCount: number, dumpCount: number) {
  const dumps: Dump[] = [];
  const allPhotos: Photo[] = [];

  for (let i = 0; i < dumpCount; i++) {
    const month = (i % 12) + 1;
    const dump = makeDump(i, month);
    dumps.push(dump);
    allPhotos.push(...dump.photos);
  }

  for (let i = 0; i < singleCount; i++) {
    const month = (i % 12) + 1;
    const photo = makePhoto(i, month);
    allPhotos.push(photo);
  }

  return { allPhotos, dumps };
}

function stubFetch(photos: Photo[], dumps: Dump[]) {
  vi.spyOn(globalThis, "fetch").mockImplementation((input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const body = url.includes("/dumps") ? dumps : photos;
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
}

function renderRiver() {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, networkMode: "always" },
      mutations: { retry: false, networkMode: "always" },
    },
  });
  return render(
    <MemoryRouter initialEntries={["/river"]}>
      <QueryClientProvider client={qc}>
        <RiverView />
      </QueryClientProvider>
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("E5-S4 probe — River virtualisation profile", () => {
  it("profile: 300-item feed (240 singles + 10 dumps = 300 photos)", async () => {
    const { allPhotos, dumps } = buildDataset(240, 10);
    stubFetch(allPhotos, dumps);

    const t0 = performance.now();
    const { container } = renderRiver();

    await vi.waitFor(
      () => {
        const main = container.querySelector("[data-state='ready']");
        if (!main) throw new Error("not ready");
      },
      { timeout: 5000 },
    );
    const renderMs = performance.now() - t0;

    const totalNodes = container.querySelectorAll("*").length;
    const imgNodes = container.querySelectorAll("img").length;
    const sectionNodes = container.querySelectorAll("section").length;
    const articleNodes = container.querySelectorAll("article").length;

    console.log("\n=== E5-S4 Virtualisation Profile (300 items) ===");
    console.log(`Dataset: 240 singles + 10 dumps (60 dump photos) = 300 photos`);
    console.log(`Total DOM nodes: ${totalNodes}`);
    console.log(`  img elements: ${imgNodes}`);
    console.log(`  section (month) elements: ${sectionNodes}`);
    console.log(`  article (dump) elements: ${articleNodes}`);
    console.log(`Render time (jsdom, not real paint): ${renderMs.toFixed(1)} ms`);
    console.log("=================================================\n");

    expect(imgNodes).toBe(300);
    expect(totalNodes).toBeGreaterThan(0);
  });

  it("profile: 600-item feed (540 singles + 10 dumps = 600 photos)", async () => {
    const { allPhotos, dumps } = buildDataset(540, 10);
    stubFetch(allPhotos, dumps);

    const t0 = performance.now();
    const { container } = renderRiver();

    await vi.waitFor(
      () => {
        const main = container.querySelector("[data-state='ready']");
        if (!main) throw new Error("not ready");
      },
      { timeout: 10000 },
    );
    const renderMs = performance.now() - t0;

    const totalNodes = container.querySelectorAll("*").length;
    const imgNodes = container.querySelectorAll("img").length;

    console.log("\n=== E5-S4 Virtualisation Profile (600 items) ===");
    console.log(`Dataset: 540 singles + 10 dumps (60 dump photos) = 600 photos`);
    console.log(`Total DOM nodes: ${totalNodes}`);
    console.log(`  img elements: ${imgNodes}`);
    console.log(`Render time (jsdom, not real paint): ${renderMs.toFixed(1)} ms`);
    console.log("=================================================\n");

    expect(imgNodes).toBe(600);
  });
});
