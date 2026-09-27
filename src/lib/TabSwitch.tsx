export type Tab = "clips" | "music";

const TABS: { id: Tab; label: string }[] = [
  { id: "clips", label: "Clips" },
  { id: "music", label: "Music" },
];

/** The app's top-level switch between the clip library and the Mixxx music library. */
export function TabSwitch({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <div className="cm-tabs" role="tablist" aria-label="Library">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={"cm-tabs__tab" + (tab === t.id ? " is-on" : "")}
          onClick={() => onTab(t.id)}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
