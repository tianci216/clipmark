// PROTOTYPE — floating bottom-centre bar to flip between UI variants.
// Updates the ?variant= search param so the choice is shareable and
// reload-stable. Arrow keys cycle; ignored while typing in a field.
// Gated out of production builds.
import { useEffect, useState } from "react";

export type VariantMeta = { key: string; name: string };

export const VARIANTS: VariantMeta[] = [
  { key: "A", name: "Simple — the video is the page" },
  { key: "B", name: "Complex — power-tool timeline" },
  { key: "C", name: "Creative — the record shelf" },
];

function readVariant(): string {
  const v = new URLSearchParams(window.location.search).get("variant");
  return VARIANTS.some((x) => x.key === v) ? v! : "A";
}

function applyVariant(key: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  window.history.replaceState({}, "", url.toString());
}

export function useVariant(): [string, (key: string) => void] {
  const [variant, setVariant] = useState(readVariant);
  const set = (key: string) => {
    applyVariant(key);
    setVariant(key);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
      const idx = VARIANTS.findIndex((x) => x.key === variant);
      if (e.key === "ArrowLeft") set(VARIANTS[(idx - 1 + VARIANTS.length) % VARIANTS.length].key);
      if (e.key === "ArrowRight") set(VARIANTS[(idx + 1) % VARIANTS.length].key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [variant]);
  return [variant, set];
}

export function PrototypeSwitcher({
  current,
  onChange,
}: {
  current: string;
  onChange: (key: string) => void;
}) {
  if (import.meta.env.PROD) return null;
  const idx = VARIANTS.findIndex((x) => x.key === current);
  const meta = VARIANTS[idx];
  const cycle = (dir: number) => {
    onChange(VARIANTS[(idx + dir + VARIANTS.length) % VARIANTS.length].key);
  };
  return (
    <div className="proto-switcher" role="navigation" aria-label="Prototype variants">
      <button onClick={() => cycle(-1)} aria-label="Previous variant">
        ‹
      </button>
      <div className="proto-switcher__label">
        <span className="proto-switcher__key">{meta.key}</span>
        {meta.name}
      </div>
      <button onClick={() => cycle(1)} aria-label="Next variant">
        ›
      </button>
    </div>
  );
}
