import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** Scroll to and pulse-highlight a row matching data-record-id or id query param. */
export function useRecordHighlight(rowPrefix = 'record') {
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = searchParams.get('highlight') || searchParams.get('entity_id') || '';

  useEffect(() => {
    if (!highlightId) return undefined;
    const timer = window.setTimeout(() => {
      const el =
        document.querySelector(`[data-record-id="${highlightId}"]`) ||
        document.getElementById(`${rowPrefix}-${highlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('record-highlight');
        window.setTimeout(() => el.classList.remove('record-highlight'), 4000);
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [highlightId, rowPrefix]);

  const rowHighlightProps = (id) =>
    id && highlightId && id === highlightId
      ? { 'data-record-id': id, className: 'record-highlight' }
      : { 'data-record-id': id || undefined };

  const clearHighlight = () => {
    if (searchParams.has('highlight') || searchParams.has('entity_id')) {
      const next = new URLSearchParams(searchParams);
      next.delete('highlight');
      next.delete('entity_id');
      setSearchParams(next, { replace: true });
    }
  };

  return { highlightId, rowHighlightProps, clearHighlight };
}

export function buildHighlightUrl(basePath, entityId, extraParams = {}) {
  const params = new URLSearchParams(extraParams);
  if (entityId) params.set('highlight', entityId);
  const qs = params.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
