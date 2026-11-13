import { useMemo, useState } from 'react';

export const ALL = 'ALL';

/** Lower-case text match across several fields. Empty query matches everything. */
export function matchesText(query, ...values) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return true;
  return values.some((v) => v != null && String(v).toLowerCase().includes(q));
}

/** Sorted select options from the distinct non-empty values in a list. */
export function distinctOptions(items, getValue, getLabel = (v) => v) {
  const seen = new Map();
  (items || []).forEach((item) => {
    const raw = getValue(item);
    if (raw == null || String(raw).trim() === '') return;
    const value = String(raw).trim();
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  });
  return [...seen.values()]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }))
    .map((value) => ({ value, label: getLabel(value) }));
}

/** Case-insensitive equality for filter values; ALL matches anything. */
export function sameValue(filter, value) {
  if (!filter || filter === ALL) return true;
  return String(value ?? '').trim().toLowerCase() === String(filter).toLowerCase();
}

/** Filter state with a clear-all and a count of active filters. */
export function useFilters(initial) {
  const [filters, setFilters] = useState(initial);
  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));
  const clear = () => setFilters(initial);
  const activeCount = Object.entries(filters).filter(
    ([key, value]) => value !== initial[key] && value !== '' && value != null
  ).length;
  return { filters, setFilter, clear, activeCount };
}

function compareValues(a, b) {
  const empty = (v) => v == null || v === '';
  if (empty(a) && empty(b)) return 0;
  if (empty(a)) return 1; // blanks last in either direction
  if (empty(b)) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Column sorting. `accessors` maps a sort key to a function returning the value to sort by.
 * Returns the sorted rows plus props for <SortHeader>.
 */
export function useSort(rows, accessors, initialKey = null, initialDir = 'asc') {
  const [sort, setSort] = useState({ key: initialKey, dir: initialDir });
  const sorted = useMemo(() => {
    const get = sort.key && accessors[sort.key];
    if (!get) return rows;
    const factor = sort.dir === 'desc' ? -1 : 1;
    return [...rows].sort((x, y) => {
      const a = get(x);
      const b = get(y);
      const empty = (v) => v == null || v === '';
      if (empty(a) || empty(b)) return compareValues(a, b);
      return factor * compareValues(a, b);
    });
    // accessors is a static object per page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);
  const toggle = (key) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  return { sorted, sort, toggle };
}

/** Days until a date (negative when past), or null. */
export function daysUntil(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((t - Date.now()) / 86400000);
}
