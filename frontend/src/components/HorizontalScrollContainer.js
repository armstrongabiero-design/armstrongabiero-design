import React, { useCallback, useEffect, useRef } from 'react';

/** Dual horizontal scroll: content area + sticky bottom bar always visible. */
export default function HorizontalScrollContainer({ children, className = '' }) {
  const topRef = useRef(null);
  const bottomRef = useRef(null);
  const spacerRef = useRef(null);
  const syncing = useRef(false);

  const syncWidths = useCallback(() => {
    const top = topRef.current;
    const spacer = spacerRef.current;
    if (!top || !spacer) return;
    spacer.style.width = `${top.scrollWidth}px`;
  }, []);

  useEffect(() => {
    syncWidths();
    const top = topRef.current;
    if (!top) return undefined;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncWidths) : null;
    if (ro) ro.observe(top);
    window.addEventListener('resize', syncWidths);
    return () => {
      if (ro) ro.disconnect();
      window.removeEventListener('resize', syncWidths);
    };
  }, [syncWidths, children]);

  const onTopScroll = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (bottomRef.current && topRef.current) {
      bottomRef.current.scrollLeft = topRef.current.scrollLeft;
    }
    syncing.current = false;
  };

  const onBottomScroll = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (topRef.current && bottomRef.current) {
      topRef.current.scrollLeft = bottomRef.current.scrollLeft;
    }
    syncing.current = false;
  };

  return (
    <div className={`horizontal-scroll-wrap ${className}`.trim()}>
      <div
        ref={topRef}
        onScroll={onTopScroll}
        className="horizontal-scroll-top overflow-x-auto overflow-y-visible pb-1"
      >
        {children}
      </div>
      <div className="horizontal-scroll-bar sticky bottom-0 z-10 bg-white/95 border-t border-slate-200 shadow-[0_-2px_6px_rgba(15,23,42,0.05)]">
        <div
          ref={bottomRef}
          onScroll={onBottomScroll}
          className="overflow-x-auto h-3.5"
          aria-label="Horizontal scroll"
        >
          <div ref={spacerRef} style={{ height: 1 }} />
        </div>
      </div>
    </div>
  );
}
