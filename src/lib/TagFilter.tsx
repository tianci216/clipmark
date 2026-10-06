import { useRef, useState } from "react";
import type { TagEntry } from "./tags";
import { suggestTags } from "./tags";

export function TagFilter({
  index,
  tokens,
  onTokens,
  compact = false,
}: {
  index: TagEntry[];
  tokens: string[];
  onTokens: (tokens: string[]) => void;
  /** Top-bar variant: no label, tighter input. */
  compact?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = draft.trim() ? suggestTags(index, draft, tokens) : [];

  const commit = (raw?: string) => {
    const val = (raw ?? draft).trim();
    if (!val) return;
    const dup = tokens.some((t) => t.toLowerCase() === val.toLowerCase());
    if (!dup) onTokens([...tokens, val]);
    setDraft("");
    setShow(false);
    inputRef.current?.focus();
  };

  const remove = (token: string) => onTokens(tokens.filter((t) => t !== token));

  return (
    <div className={"cm-tf" + (compact ? " cm-tf--compact" : "")}>
      {!compact && <span className="cm-tf__label">Tags</span>}
      {tokens.map((t) => (
        <span className="cm-tf__tok" key={t}>
          {t}
          <button onClick={() => remove(t)} aria-label={`Remove tag ${t}`}>
            ✕
          </button>
        </span>
      ))}
      <div className="cm-tf__box">
        <input
          ref={inputRef}
          value={draft}
          placeholder={tokens.length ? "" : "Filter by tag…"}
          onChange={(e) => {
            setDraft(e.target.value);
            setShow(true);
          }}
          onFocus={() => setShow(true)}
          onBlur={() => setTimeout(() => setShow(false), 120)}
          onKeyDown={(e) => {
            if (e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && tokens.length) {
              e.preventDefault();
              remove(tokens[tokens.length - 1]);
            } else if (e.key === "Escape") {
              setShow(false);
            }
          }}
        />
        {show && suggestions.length > 0 && (
          <div className="cm-tf__sugg">
            {suggestions.map((s) => (
              <button
                key={s}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(s);
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
