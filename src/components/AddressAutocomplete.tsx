"use client";
import { useState, useCallback, useRef, useEffect } from "react";
import { MapPin, Loader2 } from "lucide-react";

export interface MapboxFeature {
  id: string;
  place_name: string;
  text: string;
  context?: { id: string; text: string }[];
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (val: string) => void;
  onSelect: (feature: MapboxFeature) => void;
  placeholder?: string;
  /** Extra Tailwind / inline classes applied to the outer wrapper div */
  className?: string;
  required?: boolean;
  inputClassName?: string;
}

export function AddressAutocomplete({
  value,
  onChange,
  onSelect,
  placeholder = "Start typing an address…",
  className = "",
  required = false,
  inputClassName = "",
}: AddressAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<MapboxFeature[]>([]);
  const [open, setOpen]               = useState(false);
  const [activeIdx, setActiveIdx]     = useState(-1);
  const [loading, setLoading]         = useState(false);
  const debounceRef                   = useRef<ReturnType<typeof setTimeout>>();
  const containerRef                  = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchSuggestions = useCallback((query: string) => {
    clearTimeout(debounceRef.current);
    if (query.length < 3) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
        const url =
          `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json` +
          `?access_token=${token}` +
          `&country=ZA` +
          `&types=address,place,locality,neighborhood` +
          `&limit=5` +
          `&language=en`;
        const res  = await fetch(url);
        const data = await res.json();
        setSuggestions(data.features ?? []);
        setOpen(true);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
    fetchSuggestions(e.target.value);
  };

  const handleSelect = (feature: MapboxFeature) => {
    onChange(feature.place_name);
    onSelect(feature);
    setSuggestions([]);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx(i => Math.min(i + 1, suggestions.length - 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx(i => Math.max(i - 1, 0));
    }
    if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(suggestions[activeIdx]);
    }
    if (e.key === "Escape") {
      setOpen(false);
      setActiveIdx(-1);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        <input
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setOpen(true)}
          placeholder={placeholder}
          required={required}
          className={
            inputClassName ||
            "w-full pl-9 pr-9 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-green-400/40 focus:border-green-400 transition-all"
          }
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 animate-spin" />
        )}
      </div>

      {/* Dropdown */}
      {open && suggestions.length > 0 && (
        <ul className="absolute z-[60] mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
          {suggestions.map((feature, idx) => {
            const [primary, ...rest] = feature.place_name.split(",");
            const secondary = rest.join(",").trim();
            return (
              <li
                key={feature.id}
                onMouseDown={() => handleSelect(feature)}
                onMouseEnter={() => setActiveIdx(idx)}
                className="flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors text-sm"
                style={{ background: activeIdx === idx ? "#f0fdf4" : "white" }}
              >
                <MapPin className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{primary}</p>
                  {secondary && (
                    <p className="text-xs text-gray-400 truncate">{secondary}</p>
                  )}
                </div>
              </li>
            );
          })}
          <li className="px-4 py-2 text-[10px] text-gray-300 text-right border-t border-gray-50">
            Powered by Mapbox
          </li>
        </ul>
      )}
    </div>
  );
}