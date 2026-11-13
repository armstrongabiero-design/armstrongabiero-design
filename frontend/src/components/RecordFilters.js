import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { ALL } from '../utils/filtering';

/**
 * Search box plus dropdown filters for a records table.
 *
 * filters: [{ key, label, value, onChange, options: [{ value, label }], allLabel }]
 * A dropdown with no options is hidden, so pages don't show empty filters.
 */
export default function RecordFilters({
  search,
  onSearch,
  searchPlaceholder = 'Search…',
  filters = [],
  children,
  activeCount = 0,
  onClear,
  shown,
  total,
  noun = 'records',
  testId,
}) {
  const visible = filters.filter((f) => f.options && f.options.length > 0);
  const anyActive = activeCount > 0 || Boolean(search);
  return (
    <div className="fleet-card !p-4 mb-4 space-y-3" data-testid={testId}>
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} aria-hidden />
          <Input
            className="pl-10"
            placeholder={searchPlaceholder}
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            aria-label={searchPlaceholder}
            data-testid={testId ? `${testId}-search` : undefined}
          />
        </div>
        {children}
      </div>
      {visible.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {visible.map((f) => (
            <div key={f.key} className="min-w-0">
              <label className="block text-xs font-medium text-slate-500 mb-1" htmlFor={`filter-${f.key}`}>
                {f.label}
              </label>
              <Select value={f.value || ALL} onValueChange={f.onChange}>
                <SelectTrigger
                  id={`filter-${f.key}`}
                  className={`h-9 ${f.value && f.value !== ALL ? 'border-amber-500 bg-amber-50/50' : ''}`}
                  data-testid={`filter-${f.key}`}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{f.allLabel || 'All'}</SelectItem>
                  {f.options.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span data-testid={testId ? `${testId}-count` : undefined}>
          {shown === total ? `${total} ${noun}` : `Showing ${shown} of ${total} ${noun}`}
        </span>
        {anyActive && onClear && (
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2" onClick={onClear}>
            <X size={14} className="mr-1" />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  );
}

/** Clickable table header that toggles sorting on one column. */
export function SortHeader({ label, sortKey, sort, onSort, className }) {
  const active = sort.key === sortKey;
  const Icon = !active ? ArrowUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th className={className} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className="inline-flex items-center gap-1 font-inherit hover:text-slate-900"
        onClick={() => onSort(sortKey)}
      >
        {label}
        <Icon size={13} className={active ? 'text-amber-600' : 'text-slate-300'} aria-hidden />
      </button>
    </th>
  );
}
