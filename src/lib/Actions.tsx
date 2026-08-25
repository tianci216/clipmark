/**
 * "+ Download" and the Settings gear, in their final positions (sidebar footer on
 * desktop, header on phone). Download does nothing yet — its popover is wired by a
 * later ticket of #11.
 */
export function Actions({ onSettings }: { onSettings: () => void }) {
  return (
    <span className="cm-actions">
      <button className="cm-actions__btn" type="button" title="Download a video (coming soon)">
        + Download
      </button>
      <button
        className="cm-actions__btn"
        type="button"
        title="Settings"
        aria-label="Settings"
        onClick={onSettings}
      >
        ⚙
      </button>
    </span>
  );
}
