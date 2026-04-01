'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Input } from '@neofilm/ui';

interface AddressSuggestion {
  label: string;
  city: string;
  postcode: string;
  street: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string) => void;
  placeholder?: string;
  id?: string;
}

/**
 * Address autocomplete using the French government BAN API.
 * Free, no API key required.
 * https://api-adresse.data.gouv.fr
 */
export function AddressAutocomplete({ value, onChange, placeholder, id }: AddressAutocompleteProps) {
  const [query, setQuery] = useState(value || '');
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync external value
  useEffect(() => {
    if (value !== query) setQuery(value || '');
  }, [value]);

  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.length < 3) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    try {
      const res = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(q)}&limit=5&type=housenumber&autocomplete=1`,
      );
      if (!res.ok) return;
      const data = await res.json();

      const results: AddressSuggestion[] = (data.features || []).map((f: any) => ({
        label: f.properties.label,
        city: f.properties.city,
        postcode: f.properties.postcode,
        street: f.properties.street || f.properties.name,
      }));

      setSuggestions(results);
      setIsOpen(results.length > 0);
      setActiveIndex(-1);
    } catch {
      // Silently fail — user can still type manually
    }
  }, []);

  function handleInputChange(val: string) {
    setQuery(val);
    onChange(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 300);
  }

  function selectSuggestion(suggestion: AddressSuggestion) {
    setQuery(suggestion.label);
    onChange(suggestion.label);
    setSuggestions([]);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      selectSuggestion(suggestions[activeIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  }

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        value={query}
        onChange={(e) => handleInputChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }}
        placeholder={placeholder}
        autoComplete="off"
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          {suggestions.map((s, i) => (
            <li
              key={i}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              }`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => {
                e.preventDefault();
                selectSuggestion(s);
              }}
            >
              <span className="font-medium">{s.street}</span>
              <span className="ml-1 text-muted-foreground">{s.postcode} {s.city}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
