// PROTOTYPE — the tag filter input. Type-ahead autocomplete against the tag
// index; comma or Enter (or clicking a suggestion) commits a token; tokens
// combine as AND; unknown tags commit anyway (honest empty state).
import { useRef, useState } from "react";
import { suggestTags } from "../data";

export function TagFilter({
  tokens,
  onTokens,
}: {
  tokens: string[];
  onTokens: (t: string[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const [show, setShow] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = draft.trim() ? suggestTags(draft, tokens) : [];

  const commit = (raw?: string) => {
    const val = (raw ?? draft).trim();
    if (!val) return;
    if (!tokens.includes(val)) onTokens([...tokens, val]);
    setDraft("");
    setShow(false);
    inputRef.current?.focus();
  };

  const remove = (token: string) => onTokens(tokens.filter((t) => t !== token));

  return (
    <div className="tagfilter">
      <span className="tagfilter__label">Tags</span>
      {tokens.map((t) => (
        <span className="tagfilter__token" key={t}>
          {t}
          <button onClick={() => remove(t)} aria-label={`Remove tag ${t}`}>
            ✕
          </button>
        </span>
      ))}
      <div className="tagfilter__box">
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
          <div className="tagfilter__suggest">
            {suggestions.map((s) => (
              <button key={s} onMouseDown={(e) => { e.preventDefault(); commit(s); }}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
