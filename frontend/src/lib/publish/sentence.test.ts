import { describe, expect, it } from "vitest";

import { publishErrorSentence } from "./sentence";
import { PROBLEM_400, PROBLEM_500 } from "../../api/__fixtures__/problems";
import { ApiError } from "../../api/client";

import type { ProblemDetail } from "../../types/api";

/**
 * The publish's failure vocabulary (E4-S5D), away from React: one sentence per failure the archive can
 * name, and a fallback that never carries the server's `detail`. Bodies are the measured fixtures.
 */

function http(problem: ProblemDetail): ApiError {
  return new ApiError("http", `HTTP ${String(problem.status)}`, {
    url: "/api/v1/dumps",
    status: problem.status,
    code: problem.code,
    problem,
  });
}

function withField(field: string): ProblemDetail {
  return { ...PROBLEM_400, errors: [{ field, message: "refused" }] };
}

describe("publishErrorSentence", () => {
  it("should answer a silent archive in one sentence", () => {
    expect(
      publishErrorSentence(new ApiError("network", "unreachable", { url: "/api/v1/dumps" })),
    ).toBe("The archive didn't answer. Try again.");
    expect(
      publishErrorSentence(new ApiError("timeout", "deadline", { url: "/api/v1/dumps" })),
    ).toBe("The archive didn't answer. Try again.");
  });

  it("should never tell the curator to discard the draft (ADR-024 decision 5)", () => {
    const sentence = publishErrorSentence(http(PROBLEM_400));
    expect(sentence).toBe(
      "The archive refused the photos — one may already be in a dump. Remove it and save again.",
    );
    // The round-1 finding on E4-S5C: "reload and try again" contradicts the decision — the draft
    // survives the refusal, and a retry costs one press, never a re-upload.
    expect(sentence).not.toMatch(/reload/i);
  });

  it("should name the colour and the title the archive refused", () => {
    expect(publishErrorSentence(http(withField("backgroundColor")))).toBe(
      "The archive refused the colour. Choose an aura and save again.",
    );
    expect(publishErrorSentence(http(withField("title")))).toBe(
      "The archive refused the title. Shorten it and try again.",
    );
  });

  it("should fall back for anything else, never leaking the server's prose", () => {
    // An unexpected field, a server-side failure, and what is not an `ApiError` at all.
    expect(publishErrorSentence(http(withField("displayOrder")))).toBe(
      "The dump couldn't be saved. Try again.",
    );
    const serverFailure = http(PROBLEM_500);
    expect(publishErrorSentence(serverFailure)).toBe("The dump couldn't be saved. Try again.");
    expect(publishErrorSentence(serverFailure)).not.toContain(PROBLEM_500.detail);
    expect(publishErrorSentence(new Error("boom"))).toBe("The dump couldn't be saved. Try again.");
    expect(publishErrorSentence(null)).toBe("The dump couldn't be saved. Try again.");
  });
});
