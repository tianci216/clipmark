/**
 * "+ Download" and Settings live here in their final positions. They do nothing yet —
 * the download popover and the Settings pane are wired by later tickets of #11.
 */
export function Actions() {
  return (
    <span className="cm-actions">
      <button className="cm-actions__btn" type="button" title="Download a video (coming soon)">
        + Download
      </button>
      <button
        className="cm-actions__btn"
        type="button"
        title="Settings (coming soon)"
        aria-label="Settings"
      >
        ⚙
      </button>
    </span>
  );
}
