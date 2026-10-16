import type { HTMLAttributes, ReactNode } from "react";

export interface GlassPanelProps extends HTMLAttributes<HTMLDivElement> {
  /** The panel's content; layout utilities go through `className`. */
  children: ReactNode;
}

/**
 * The single glass primitive (DESIGN-SYSTEM §3, §9): everything translucent composes this.
 *
 * The material itself lives in `styles/glass.css` and reads tokens only (§2.2's hex-literal
 * rule); this component adds the caller's layout utilities and nothing else. There is no
 * second glass implementation, and no shadow — elevation is not this component's job (§3).
 */
export function GlassPanel({ children, className, ...rest }: GlassPanelProps) {
  return (
    <div className={className ? `glass ${className}` : "glass"} {...rest}>
      {children}
    </div>
  );
}
