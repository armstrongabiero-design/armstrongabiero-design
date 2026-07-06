import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

let cachedCountries = null;

export async function fetchCountries() {
  if (cachedCountries) {
    return cachedCountries;
  }
  const response = await axios.get(`${API}/countries/all-list`);
  cachedCountries = response.data.countries || [];
  return cachedCountries;
}

export function normalizeCountryCode(code) {
  if (!code) return '';
  const upper = String(code).toUpperCase();
  const legacy = { GHANA: 'GH', LIBERIA: 'LR', SAO_TOME: 'ST' };
  if (legacy[upper]) return legacy[upper];
  if (upper.length === 2) return upper;
  return code;
}

export function getCountryLabel(code, countries = cachedCountries) {
  if (!code) return '';
  const upper = String(code).toUpperCase();
  const legacy = { GHANA: 'GH', LIBERIA: 'LR', SAO_TOME: 'ST' };
  const iso = legacy[upper] || upper;
  const list = countries || [];
  const match = list.find((c) => c.code === iso);
  if (match) return match.name;
  const names = { GH: 'Ghana', LR: 'Liberia', ST: 'São Tomé and Príncipe' };
  return names[iso] || code;
}

/** ISO default for new records (Ghana). */
export const DEFAULT_COUNTRY_CODE = 'GH';

/** CSS class for country badge in tables. */
export function getCountryBadgeClass(code) {
  const iso = normalizeCountryCode(code);
  const map = {
    GH: 'country-badge ghana',
    LR: 'country-badge liberia',
    ST: 'country-badge sao-tome',
  };
  return map[iso] || 'country-badge';
}

/** Match location/record country against ISO filter (handles legacy enum). */
export function countryMatchesFilter(recordCountry, filterCode) {
  if (!filterCode || filterCode === 'ALL') return true;
  return normalizeCountryCode(recordCountry) === normalizeCountryCode(filterCode);
}

/** Flag emoji for primary fleet countries (fallback empty). */
export function getCountryFlag(code) {
  const iso = normalizeCountryCode(code);
  const flags = { GH: '🇬🇭', LR: '🇱🇷', ST: '🇸🇹' };
  return flags[iso] || '';
}

/**
 * Searchable country dropdown — stores ISO alpha-2 in `value`.
 */
export function CountrySelect({
  value,
  onValueChange,
  placeholder = 'Select country',
  className,
  includeAllOption = false,
  allLabel = 'All countries',
}) {
  const [countries, setCountries] = useState(cachedCountries || []);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let mounted = true;
    fetchCountries()
      .then((list) => {
        if (mounted) setCountries(list);
      })
      .catch(() => {
        if (mounted) {
          setCountries([
            { code: 'GH', name: 'Ghana' },
            { code: 'LR', name: 'Liberia' },
            { code: 'ST', name: 'São Tomé and Príncipe' },
          ]);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const isoValue = normalizeCountryCode(value);

  const filtered = countries.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={className}>
      <input
        type="text"
        placeholder="Search countries…"
        className="mb-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <Select value={isoValue || ''} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="max-h-[240px]">
          {includeAllOption && (
            <SelectItem value="ALL">{allLabel}</SelectItem>
          )}
          {filtered.map((country) => (
            <SelectItem key={country.code} value={country.code}>
              {country.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default CountrySelect;
