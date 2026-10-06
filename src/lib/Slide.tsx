import { useEffect, useRef, type ReactNode } from "react";

/**
 * One page on the sliding track. A hidden page stays mounted (its state survives the
 * switch) but is inert and aria-hidden, so it cannot be tabbed into or read out.
 */
export function Slide({ hidden, children }: { hidden: boolean; children: ReactNode }) {
  const el = useRef<HTMLElement>(null);
  useEffect(() => {
    // React 18 has no `inert` prop; set the DOM property directly.
    if (el.current) el.current.inert = hidden;
  }, [hidden]);
  return (
    <section className="cm-slide" ref={el} aria-hidden={hidden}>
      {children}
    </section>
  );
}
