import { useEffect, useId, useRef, useState } from "react";

export interface ComboboxOption {
  /** Unique key for the option (list key + what "selected" is compared
  against) — doesn't have to be the same string as `label`. */
  value: string;
  label: string;
}

interface Props {
  placeholder: string;
  value: string;
  disabled?: boolean;
  disabledPlaceholder?: string;
  /** Minimum characters typed before `search` is called at all — lets a
  caller avoid firing a network request on every single keystroke from
  character 1. Defaults to 0 (search immediately, including on focus with
  an empty query — the right default for a small synchronous source like
  a state list, where "show everything" on focus is useful). */
  minChars?: number;
  /** 0 for a synchronous in-memory source (state names) — nothing to
  debounce. Non-zero for anything that hits the network (placeSearch.ts's
  city search), so a burst of keystrokes doesn't turn into a burst of
  requests. */
  debounceMs?: number;
  search: (query: string) => ComboboxOption[] | Promise<ComboboxOption[]>;
  onSelect: (option: ComboboxOption) => void;
}

/** A searchable dropdown — a plain text input that filters/searches as you
type, shows a list of matches, and commits a selection on click or Enter.
Generic over its data source (`search`) so it backs both the post-a-load
form's state picker (instant, synchronous, the fixed US_STATES list) and
its city picker (debounced, async, live Nominatim search) with one
implementation — see LoadsPage.tsx for both call sites. */
export default function Combobox({
  placeholder,
  value,
  disabled,
  disabledPlaceholder,
  minChars = 0,
  debounceMs = 0,
  search,
  onSelect,
}: Props) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ComboboxOption[]>([]);
  const [highlighted, setHighlighted] = useState(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const listboxId = useId();

  useEffect(() => {
    setText(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  function runSearch(query: string) {
    if (query.trim().length < minChars) {
      setOptions([]);
      setLoading(false);
      return;
    }
    const thisRequest = ++requestId.current;
    setLoading(true);
    Promise.resolve(search(query)).then((results) => {
      if (thisRequest !== requestId.current) return; // a newer keystroke already superseded this one
      setOptions(results);
      setLoading(false);
      setHighlighted(0);
    });
  }

  function handleChange(newText: string) {
    setText(newText);
    setOpen(true);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (debounceMs === 0) {
      runSearch(newText);
    } else {
      debounceTimer.current = setTimeout(() => runSearch(newText), debounceMs);
    }
  }

  function handleFocus() {
    if (disabled) return;
    setOpen(true);
    runSearch(text);
  }

  function commit(option: ComboboxOption) {
    onSelect(option);
    setText(option.label);
    setOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      commit(options[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const showList = open && !disabled;

  return (
    <div className="combobox">
      <input
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={disabled ? disabledPlaceholder : placeholder}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={handleFocus}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />
      {showList && (
        <ul className="combobox-list" role="listbox" id={listboxId}>
          {loading ? (
            <li className="combobox-status">Searching…</li>
          ) : options.length > 0 ? (
            options.map((option, i) => (
              <li
                key={option.value}
                role="option"
                aria-selected={i === highlighted}
                className={i === highlighted ? "combobox-option active" : "combobox-option"}
                // onMouseDown (not onClick) + preventDefault so the input's
                // onBlur — which fires before a click's mouseup — doesn't
                // close the list out from under the click.
                onMouseDown={(e) => {
                  e.preventDefault();
                  commit(option);
                }}
                onMouseEnter={() => setHighlighted(i)}
              >
                {option.label}
              </li>
            ))
          ) : (
            text.trim().length >= minChars && <li className="combobox-status">No matches</li>
          )}
        </ul>
      )}
    </div>
  );
}
