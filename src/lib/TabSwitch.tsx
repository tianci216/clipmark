export type Tab = "clips" | "music";

const TABS: { id: Tab; label: string }[] = [
  { id: "clips", label: "Clips" },
  { id: "music", label: "Music" },
];

function TabIcon({ tab }: { tab: Tab }) {
  return tab === "clips" ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M10 9.5v5l4.5-2.5z" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 18V6l10-2v12" />
      <circle cx="6.5" cy="18" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  );
}

/**
 * The app's top-level switch between the clip library and the Mixxx music library:
 * a rounded segmented pill whose thumb slides under the selected tab, in step with
 * the page track below the top bar.
 */
export function TabSwitch({ tab, onTab }: { tab: Tab; onTab: (tab: Tab) => void }) {
  return (
    <div className="cm-tabs" role="tablist" aria-label="Library" data-on={tab}>
      <span className="cm-tabs__thumb" aria-hidden="true" />
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          className={"cm-tabs__tab" + (tab === t.id ? " is-on" : "")}
          onClick={() => onTab(t.id)}
        >
          <TabIcon tab={t.id} />
          {t.label}
        </button>
      ))}
    </div>
  );
}
