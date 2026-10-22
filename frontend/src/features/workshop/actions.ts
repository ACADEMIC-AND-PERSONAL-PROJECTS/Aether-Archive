/**
 * The workshop's quiet action grammar, in one place: text, a 44 px target, a 180 ms press, an inset
 * focus ring. It lived in `WorkshopView` until the aura picker (E4-S4C) became the second file that
 * speaks it.
 */
export const QUIET_ACTION =
  "flex min-h-11 shrink-0 cursor-pointer items-center rounded-[10px] px-3 text-sm text-aura-text underline decoration-aura-text/40 underline-offset-4 transition-colors duration-[var(--motion-duration-quick)] active:bg-aura-text/6 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/70";
