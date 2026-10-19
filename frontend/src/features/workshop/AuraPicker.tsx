import { useId, useState, type ChangeEvent, type KeyboardEvent } from "react";

import { QUIET_ACTION } from "./actions";

import type { AuraChoiceResult } from "../../hooks/useAura";
import type { PaletteColor } from "../../lib/color/types";

/**
 * The aura controls (E4-S4C): the ranked swatches, the hex field and the reset, as the panel's
 * second group.
 *
 * The field commits on **Enter or blur**, and a complete `#rrggbb` also applies live as it is typed —
 * the preview never waits for a save the panel does not have, and a refusal (pure black or white,
 * ADR-023) is reported the moment the seventh character lands. Swatches apply on press. `onChoose`
 * returns the verdict rather than the component re-deriving it: the policy lives in the theme layer,
 * the picker owns only the words.
 */

const MESSAGES = {
  invalid: "Not a colour — use #RRGGBB, like #1f7a7a.",
  refused: "Pure black and pure white are outside the palette — try a neighbour.",
} as const;

const HEX_SHAPE = /^#[0-9a-fA-F]{6}$/;

export interface AuraPickerProps {
  readonly chosen: string | null;
  readonly suggestions: readonly PaletteColor[];
  readonly onChoose: (value: string) => AuraChoiceResult;
  readonly onReset: () => void;
}

export function AuraPicker({ chosen, suggestions, onChoose, onReset }: AuraPickerProps) {
  const fieldId = useId();
  const messageId = useId();
  /** The text being edited; `null` means the field follows the chosen aura instead. */
  const [draft, setDraft] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const text = draft ?? chosen ?? "";

  /** One value's verdict; a success hands the field back to `chosen`, a failure keeps the text. */
  const apply = (value: string): void => {
    const result = onChoose(value);
    if (result.status === "applied") {
      setDraft(null);
      setMessage(null);
    } else {
      setMessage(MESSAGES[result.status]);
    }
  };

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const value = event.target.value;
    setDraft(value);
    // While typing, only a complete shape is worth a verdict; a partial hex stays quiet.
    if (HEX_SHAPE.test(value.trim())) {
      apply(value);
    } else {
      setMessage(null);
    }
  };

  /** Enter and blur: the verdict for whatever is in the field, including incomplete shapes. */
  const commit = (): void => {
    const value = text.trim();
    if (value === "" || value === chosen) {
      setDraft(null);
      setMessage(null);
      return;
    }
    apply(value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      commit();
    }
  };

  const handleReset = (): void => {
    onReset();
    setDraft(null);
    setMessage(null);
  };

  return (
    <section
      aria-label="Aura picker"
      className="flex flex-col gap-3 border-t border-aura-text/15 pt-3"
    >
      {suggestions.length > 0 ? (
        <ul aria-label="Suggested colours" className="flex flex-wrap items-center gap-1">
          {suggestions.map((colour) => {
            const percent = Math.round(colour.weight * 100);
            return (
              <li key={colour.hex}>
                <button
                  type="button"
                  aria-pressed={chosen === colour.hex}
                  aria-label={`Use ${colour.hex}, ${percent}% mean share`}
                  title={`${percent}% mean share`}
                  onClick={() => apply(colour.hex)}
                  className="flex h-11 w-11 items-center justify-center rounded-full aria-pressed:ring-2 aria-pressed:ring-aura-text focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-4 focus-visible:outline-aura-text/70"
                >
                  <span
                    aria-hidden="true"
                    className="h-7 w-7 rounded-full [border:var(--aura-hairline)]"
                    style={{ backgroundColor: colour.hex }}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <label htmlFor={fieldId} className="text-xs tracking-wide text-aura-muted uppercase">
          Aura
        </label>
        <input
          id={fieldId}
          type="text"
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={commit}
          placeholder="#1f7a7a"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-invalid={message !== null ? true : undefined}
          aria-describedby={message !== null ? messageId : undefined}
          className="min-h-11 w-28 rounded-[10px] bg-transparent px-3 text-sm text-aura-text [border:var(--aura-hairline)] placeholder:text-aura-muted focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-aura-text/70"
        />
        {chosen !== null ? (
          <button type="button" onClick={handleReset} className={QUIET_ACTION}>
            {suggestions.length > 0 ? "Reset to extracted" : "Reset"}
          </button>
        ) : null}
      </div>

      {/* Kept mounted: a region inserted with its text is not reliably announced (E3-S5B). */}
      <p id={messageId} role="status" className="text-sm text-aura-text">
        {message}
      </p>
    </section>
  );
}
