import { ApiError } from "../../api/client";

/**
 * The publish's failure vocabulary (E4-S5D).
 *
 * ADR-024 decision 2 applies to the wire's failures too: a refusal is answered with **one** sentence,
 * never the server's `detail` (that prose is for the operator), and a field this client did not expect
 * must not leak the archive's wording into the panel.
 *
 * The `photoIds` sentence is the one ADR-024 decision 5 pins: the six photos are archived before the
 * publish runs, so a retry costs one press and never a re-upload — asking the curator to reload or
 * discard would contradict the decision (refused in review round 1 on E4-S5C). The client mirrors every
 * `photoIds` check it can (E4-S5B), so what the server can still refuse there is a photo already
 * curated: remove that tile and save again.
 */
export function publishErrorSentence(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.kind === "network" || error.kind === "timeout") {
      return "The archive didn't answer. Try again.";
    }
    if (error.code === "validation-failure") {
      const field = error.problem?.errors?.[0]?.field;
      if (field === "photoIds") {
        return "The archive refused the photos — one may already be in a dump. Remove it and save again.";
      }
      if (field === "backgroundColor") {
        return "The archive refused the colour. Choose an aura and save again.";
      }
      if (field === "title") {
        return "The archive refused the title. Shorten it and try again.";
      }
    }
  }
  return "The dump couldn't be saved. Try again.";
}
