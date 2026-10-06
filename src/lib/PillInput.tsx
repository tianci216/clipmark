import { useRef, useState, type ReactNode } from "react";
import type { Pill, PillConfig, PillEvent } from "./pills";
import { pillStep, suggestionsFor } from "./pills";

/** Autocorrect and autocapitalise off, spellcheck on: for every field holding names or moves. */
export const plainText = { autoCorrect: "off", autoCapitalize: "off", spellCheck: true } as const;

/**
 * The shared pill input: create form Tags (and Dancers next), and the top-bar search.
 * All behaviour lives in pills.ts `pillStep`; this only renders it and feeds it events.
 *
 * `pills` is controlled. `draft` (the typed text) may be controlled too, so a form can keep it
 * across remounts and commit it on Save with `commitDraft`; left out, the field keeps its own.
 * Each pill renders as `.cm-pill--<kind>`.
 */
export function PillInput<K extends string>({
  config,
  pills,
  onPills,
  draft: draftProp,
  onDraft,
  placeholder,
  ariaLabel,
  className,
}: {
  config: PillConfig<K>;
  pills: Pill<K>[];
  onPills: (pills: Pill<K>[]) => void;
  draft?: string;
  onDraft?: (draft: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
}) {
  const [ownDraft, setOwnDraft] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const draft = draftProp ?? ownDraft;
  const state = { pills, draft, open, hi };
  const suggestions = open ? suggestionsFor(config, state) : [];
  const labelled = Object.keys(config.kinds).length > 1;

  const send = (event: PillEvent): boolean => {
    const { state: next, handled } = pillStep(config, state, event);
    if (next.pills !== pills) onPills(next.pills);
    if (next.draft !== draft) {
      if (draftProp === undefined) setOwnDraft(next.draft);
      onDraft?.(next.draft);
    }
    setOpen(next.open);
    setHi(next.hi);
    return handled;
  };

  return (
    <div className={"cm-pills" + (className ? " " + className : "")} onClick={() => inputRef.current?.focus()}>
      {pills.map((p, i) => (
        <span className={"cm-pill cm-pill--" + p.kind} key={p.kind + ":" + p.text}>
          {p.text}
          <button
            type="button"
            aria-label={`Remove ${config.kinds[p.kind].label} ${p.text}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => {
              e.stopPropagation();
              send({ type: "remove", index: i });
            }}
          >
            ✕
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        className="cm-pills__in"
        value={draft}
        placeholder={pills.length ? "" : placeholder}
        aria-label={ariaLabel ?? placeholder}
        role="combobox"
        aria-expanded={suggestions.length > 0}
        aria-autocomplete="list"
        {...plainText}
        onChange={(e) => send({ type: "input", text: e.target.value })}
        onFocus={() => send({ type: "focus" })}
        onBlur={() => send({ type: "blur" })}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (send({ type: "key", key: e.key })) {
            e.preventDefault();
            // A consumed key (Escape closing the list) must not also reach the watch page.
            e.stopPropagation();
          }
        }}
      />
      {suggestions.length > 0 && (
        <div className="cm-pills__sugg" role="listbox">
          {suggestions.map((s, i) => (
            <button
              key={s.kind + ":" + s.text}
              type="button"
              role="option"
              aria-selected={i === hi}
              className={"cm-pills__opt cm-pills__opt--" + s.kind + (i === hi ? " is-hi" : "")}
              onMouseDown={(e) => {
                e.preventDefault(); // keep focus in the field
                send({ type: "pick", index: i });
              }}
              onMouseEnter={() => send({ type: "hover", index: i })}
            >
              <span>{highlight(s.text, draft.trim())}</span>
              <small>
                {labelled ? config.kinds[s.kind].label + " · " : ""}
                {s.count}
              </small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function highlight(text: string, q: string): ReactNode {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <b>{text.slice(i, i + q.length)}</b>
      {text.slice(i + q.length)}
    </>
  );
}

/** Tag pills on a saved Clip (the Clip list): filled raised-surface, accent text. */
export function TagPills({ tags }: { tags: string[] }) {
  return (
    <>
      {tags.map((t) => (
        <span className="cm-pill cm-pill--tag cm-pill--sm" key={t}>
          {t}
        </span>
      ))}
    </>
  );
}
