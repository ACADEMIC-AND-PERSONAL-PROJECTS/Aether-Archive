import { describe, expect, it, vi } from "vitest";

import { prepareHero, type HeroEnvironment, type HeroSource } from "./hero";
import { FALLBACK_THEME, type AuraTheme } from "../color/theme";

/**
 * The hero pipeline's order and its two failure policies, exercised with a fake environment.
 *
 * The environment is faked because jsdom cannot be anything else here — measured in the test process:
 * `typeof HTMLImageElement.prototype.decode` is `undefined`, `createImageBitmap`, `OffscreenCanvas` and
 * `ImageData` are `undefined`, and an image pointed at a data URL fires **neither** `load` nor `error`
 * (probe output in the PR). What is real in every test below is `prepareHero` itself: the ordering, the
 * error policy and the release hand-off are the shipped code.
 */

/** A theme that is not the neutral set, so "the tone was applied" cannot pass by accident. */
const PHOTO_THEME: AuraTheme = { ...FALLBACK_THEME, bg: "#141a24" };

function environment(overrides: Partial<HeroEnvironment> = {}): HeroEnvironment {
  return {
    fetchBytes: vi.fn(async () => new Blob(["photo bytes"])),
    decode: vi.fn(async (): Promise<HeroSource> => ({ src: "blob:photo", release: vi.fn() })),
    tone: vi.fn(async () => PHOTO_THEME),
    ...overrides,
  };
}

describe("prepareHero", () => {
  it("should read, decode and tone the url it was given", async () => {
    const fetcher = vi.fn(async () => new Blob(["photo bytes"]));
    const tones = vi.fn(async () => PHOTO_THEME);
    const hero = await prepareHero(
      "/images/one.png",
      environment({ fetchBytes: fetcher, tone: tones }),
      new AbortController().signal,
    );

    expect(fetcher).toHaveBeenCalledWith("/images/one.png", expect.anything());
    expect(tones).toHaveBeenCalledTimes(1);
    expect(hero).toMatchObject({ src: "blob:photo", theme: PHOTO_THEME });
  });

  it("should hand the decoded bytes to the tone step without a second read", async () => {
    const bytes = new Blob(["photo bytes"]);
    const tones = vi.fn(async () => PHOTO_THEME);
    await prepareHero(
      "/images/one.png",
      environment({ fetchBytes: async () => bytes, tone: tones }),
      new AbortController().signal,
    );

    // The whole reason the pipeline is one function: the extraction runs over the bytes the `<img>` was
    // handed, so the photo crosses the network once.
    expect(tones).toHaveBeenCalledWith(bytes);
  });

  it("should reject when the bytes cannot be read, and never decode them", async () => {
    const decode = vi.fn(async (): Promise<HeroSource> => ({
      src: "blob:photo",
      release: vi.fn(),
    }));
    const hero = prepareHero(
      "/images/gone.png",
      environment({
        fetchBytes: async () => {
          throw new Error("The photo could not be read (404).");
        },
        decode,
      }),
      new AbortController().signal,
    );

    await expect(hero).rejects.toThrow("The photo could not be read (404).");
    expect(decode).not.toHaveBeenCalled();
  });

  it("should reject when the bytes cannot be decoded", async () => {
    const hero = prepareHero(
      "/images/broken.png",
      environment({
        decode: async () => {
          throw new Error("The photo could not be decoded.");
        },
      }),
      new AbortController().signal,
    );

    await expect(hero).rejects.toThrow("The photo could not be decoded.");
  });

  it("should reveal the photo with no tone when the tone step fails", async () => {
    const hero = await prepareHero(
      "/images/one.png",
      environment({
        tone: async () => {
          // Every extraction failure is one of two codes (ADR-018); both end here, as a fallback.
          throw new Error("unsupported");
        },
      }),
      new AbortController().signal,
    );

    // The policy in one assertion: a cosmetic step never withholds the photo. The page keeps the
    // stylesheet's neutral set, and the hero is still paintable.
    expect(hero.theme).toBeNull();
    expect(hero.src).toBe("blob:photo");
  });

  it("should hand the release through, so the caller owns the decoded URL's lifetime", async () => {
    const release = vi.fn();
    const hero = await prepareHero(
      "/images/one.png",
      environment({ decode: async () => ({ src: "blob:photo", release }) }),
      new AbortController().signal,
    );

    expect(release).not.toHaveBeenCalled();
    hero.release();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("should wait for the decode even when the tone answers first", async () => {
    let decoded = false;
    const hero = await prepareHero(
      "/images/one.png",
      environment({
        decode: async () => {
          decoded = true;
          return { src: "blob:photo", release: vi.fn() };
        },
      }),
      new AbortController().signal,
    );

    expect(decoded).toBe(true);
    expect(hero.src).toBe("blob:photo");
  });

  it("should hand the tone over while the decode is still pending", async () => {
    const tones: AuraTheme[] = [];
    let finishDecode: (() => void) | undefined;
    const hero = prepareHero(
      "/images/one.png",
      environment({
        decode: () =>
          new Promise<HeroSource>((resolve) => {
            finishDecode = () => resolve({ src: "blob:photo", release: vi.fn() });
          }),
      }),
      new AbortController().signal,
      { onTone: (theme) => tones.push(theme) },
    );

    // The state the splash spends the wait in: the colour of the photo is known, the pixels are not.
    await vi.waitFor(() => expect(tones).toEqual([PHOTO_THEME]));
    expect(finishDecode).toBeTypeOf("function");

    finishDecode?.();
    await expect(hero).resolves.toMatchObject({ src: "blob:photo", theme: PHOTO_THEME });
  });

  it("should never announce a tone it does not have", async () => {
    const onTone = vi.fn();
    const signal = new AbortController().signal;

    // `null` and a rejection are the two shapes a missing tone arrives in (ADR-018's two codes); neither
    // is a colour, so neither may be announced — the caller would paint a placeholder out of nothing.
    await prepareHero("/images/one.png", environment({ tone: async () => null }), signal, {
      onTone,
    });
    await prepareHero(
      "/images/two.png",
      environment({
        tone: async () => {
          throw new Error("unsupported");
        },
      }),
      signal,
      { onTone },
    );

    expect(onTone).not.toHaveBeenCalled();
  });
});
