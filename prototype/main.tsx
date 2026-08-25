// PROTOTYPE — three redesigns of the whole Clipmark frontend (Library + Player), switchable
// via ?variant=A|B|C, viewed at desktop or inside a 390×844 phone frame via ?device=desktop|mobile.
// The question: how should the UI show that Clips belong to Videos, on desktop and on a phone?
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./base.css";
import { VariantA } from "./variants/A";
import { VariantB } from "./variants/B";
import { VariantC } from "./variants/C";

const VARIANTS = [
  { key: "A", name: "Reel — video rows with clip strips", C: VariantA },
  { key: "B", name: "Explorer — folder › video › clip tree", C: VariantB },
  { key: "C", name: "Deck — clips grouped under parents", C: VariantC },
] as const;
type Key = (typeof VARIANTS)[number]["key"];
type Device = "desktop" | "mobile";

function useParams() {
  const read = () => {
    const p = new URLSearchParams(location.search);
    const v = (p.get("variant") ?? "A").toUpperCase() as Key;
    return {
      variant: VARIANTS.some((x) => x.key === v) ? v : ("A" as Key),
      device: (p.get("device") === "mobile" ? "mobile" : "desktop") as Device,
      embed: p.get("embed") === "1",
    };
  };
  const [s, setS] = useState(read);
  const set = (patch: Partial<{ variant: Key; device: Device }>) => {
    const p = new URLSearchParams(location.search);
    if (patch.variant) p.set("variant", patch.variant);
    if (patch.device) p.set("device", patch.device);
    history.replaceState(null, "", "?" + p.toString());
    setS(read());
  };
  return { ...s, set };
}

function Shell() {
  const { variant, device, embed, set } = useParams();
  const idx = VARIANTS.findIndex((v) => v.key === variant);
  const cycle = (d: 1 | -1) =>
    set({ variant: VARIANTS[(idx + d + VARIANTS.length) % VARIANTS.length].key });

  useEffect(() => {
    if (embed) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowRight") cycle(1);
      if (e.key === "ArrowLeft") cycle(-1);
      if (e.key === "m") set({ device: device === "mobile" ? "desktop" : "mobile" });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const Current = VARIANTS[idx].C;
  if (embed) return <Current />;

  return (
    <>
      {device === "desktop" ? (
        <Current />
      ) : (
        <div className="phone-stage">
          <div className="phone">
            <iframe title="phone" src={`?variant=${variant}&device=mobile&embed=1`} />
          </div>
        </div>
      )}
      {import.meta.env.MODE !== "production" && (
        <div className="proto-bar">
          <button onClick={() => cycle(-1)} aria-label="Previous variant">‹</button>
          <span className="lbl">
            {variant} — {VARIANTS[idx].name}
          </span>
          <button onClick={() => cycle(1)} aria-label="Next variant">›</button>
          <span className="sep" />
          <button className={device === "desktop" ? "is-on" : ""} onClick={() => set({ device: "desktop" })}>
            Desktop
          </button>
          <button className={device === "mobile" ? "is-on" : ""} onClick={() => set({ device: "mobile" })}>
            Phone<kbd>m</kbd>
          </button>
        </div>
      )}
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Shell />
  </StrictMode>,
);
