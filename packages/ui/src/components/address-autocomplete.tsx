"use client";

import * as React from "react";
import { cn } from "../lib/utils";

// ─── Types ──────────────────────────────────────────────

export interface AddressSelection {
  label: string;
  city?: string;
  postcode?: string;
  lat: number;
  lng: number;
  raw?: unknown;
}

export interface AddressAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelect: (selection: AddressSelection) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minChars?: number;
  debounceMs?: number;
}

// ─── API call ───────────────────────────────────────────

const API_URL = "https://api-adresse.data.gouv.fr/search";

interface GouvFeature {
  properties: {
    label: string;
    city: string;
    postcode: string;
    type: string;
    name: string;
    context: string;
    [key: string]: unknown;
  };
  geometry: {
    coordinates: [number, number]; // [lng, lat]
  };
}

async function fetchAddresses(
  query: string,
): Promise<(AddressSelection & { type: string; name: string; context: string })[]> {
  const url = `${API_URL}?q=${encodeURIComponent(query)}&limit=6`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const json = await res.json();
  return (json.features || []).map((f: GouvFeature) => ({
    label: f.properties.label,
    city: f.properties.city,
    postcode: f.properties.postcode,
    lng: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    type: f.properties.type,
    name: f.properties.name,
    context: f.properties.context,
    raw: f,
  }));
}

// ─── Inline SVG icons (no external deps) ────────────────

function MapPinIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function SearchIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      className={className}
      style={style}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

function LoaderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

// ─── Highlight matching text ────────────────────────────

function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 2) return <>{text}</>;
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escapedQuery})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="bg-primary/15 text-primary rounded-sm px-0.5 font-semibold">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

// ─── Component ──────────────────────────────────────────

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Rechercher une adresse...",
  disabled = false,
  className,
  minChars = 3,
  debounceMs = 300,
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = React.useState<
    (AddressSelection & { type: string; name: string; context: string })[]
  >([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(-1);
  const [error, setError] = React.useState<string | null>(null);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Close on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Fetch suggestions with debounce + cancelled flag
  React.useEffect(() => {
    if (value.length < minChars) {
      setSuggestions([]);
      setIsOpen(false);
      setError(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(() => {
      setIsLoading(true);
      setError(null);

      fetchAddresses(value)
        .then((results) => {
          if (!cancelled) {
            setSuggestions(results);
            setIsOpen(true);
            setActiveIndex(-1);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setError("Erreur de connexion");
            setSuggestions([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoading(false);
          }
        });
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [value, minChars, debounceMs]);

  // Scroll active item into view
  React.useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  function handleSelect(item: AddressSelection) {
    onChange(item.label);
    onSelect(item);
    setIsOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && suggestions[activeIndex]) {
          handleSelect(suggestions[activeIndex]);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
    }
  }

  function handleClear() {
    onChange("");
    setSuggestions([]);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Input field */}
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          style={{ left: '14px' }}
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
          aria-activedescendant={activeIndex >= 0 ? `address-option-${activeIndex}` : undefined}
          style={{ paddingLeft: '42px' }}
          className={cn(
            "flex h-10 w-full rounded-md border border-input bg-transparent py-2 pr-9 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
        />
        {/* Right side: loader or clear button */}
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
          {isLoading && (
            <LoaderIcon className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
          {!isLoading && value.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="rounded-sm p-0.5 text-muted-foreground hover:text-foreground transition-colors"
              tabIndex={-1}
              aria-label="Effacer"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Dropdown */}
      {isOpen && (
        <div
          className="address-dropdown absolute mt-1.5 w-full overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl"
          style={{ zIndex: 1000 }}
        >
          {/* Results list */}
          <ul ref={listRef} role="listbox" className="address-dropdown-list max-h-72 overflow-auto py-1.5">
            {/* Loading state */}
            {isLoading && suggestions.length === 0 && (
              <li className="flex items-center gap-3 px-4 py-3">
                <LoaderIcon className="h-4 w-4 animate-spin" />
                <span className="text-sm opacity-80">Recherche en cours...</span>
              </li>
            )}

            {/* Error */}
            {error && (
              <li className="flex items-center gap-3 px-4 py-3">
                <svg className="h-4 w-4 text-destructive" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="m15 9-6 6" />
                  <path d="m9 9 6 6" />
                </svg>
                <span className="text-sm text-destructive">{error}</span>
              </li>
            )}

            {/* Empty state */}
            {suggestions.length === 0 && !isLoading && !error && (
              <li className="flex flex-col items-center gap-1.5 px-4 py-4 text-center">
                <MapPinIcon className="h-5 w-5 opacity-40" />
                <span className="text-sm opacity-70">Aucune adresse trouvée</span>
                <span className="text-xs opacity-50">Essayez un autre terme de recherche</span>
              </li>
            )}

            {/* Suggestions */}
            {suggestions.map((item, idx) => (
              <li
                key={`${item.lat}-${item.lng}-${idx}`}
                id={`address-option-${idx}`}
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(item);
                }}
                onMouseEnter={() => setActiveIndex(idx)}
                className={cn(
                  "address-dropdown-item flex items-start gap-3 cursor-pointer px-4 py-2.5 mx-1.5 rounded-lg transition-colors",
                  idx === activeIndex
                    ? "address-dropdown-item-active"
                    : "",
                )}
              >
                {/* Icon */}
                <div className={cn(
                  "address-dropdown-icon mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                )}>
                  <MapPinIcon className="h-3.5 w-3.5" />
                </div>

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <p className="address-dropdown-name truncate text-sm font-medium leading-tight">
                    <HighlightText text={item.name} query={value} />
                  </p>
                  <p className="address-dropdown-detail mt-0.5 truncate text-xs leading-tight opacity-70">
                    {item.postcode} {item.city}
                    {item.context && (
                      <span className="opacity-60"> — {item.context}</span>
                    )}
                  </p>
                </div>

                {/* Postcode badge */}
                {item.postcode && (
                  <span className="address-dropdown-badge mt-0.5 shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums">
                    {item.postcode}
                  </span>
                )}
              </li>
            ))}
          </ul>

          {/* Footer hint */}
          {suggestions.length > 0 && (
            <div className="address-dropdown-footer border-t px-4 py-1.5">
              <p className="text-[10px] opacity-60 flex items-center gap-1.5">
                <kbd className="address-dropdown-kbd rounded px-1 py-px text-[9px] font-mono">↑↓</kbd>
                naviguer
                <kbd className="address-dropdown-kbd rounded px-1 py-px text-[9px] font-mono ml-1">↵</kbd>
                sélectionner
                <kbd className="address-dropdown-kbd rounded px-1 py-px text-[9px] font-mono ml-1">esc</kbd>
                fermer
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
