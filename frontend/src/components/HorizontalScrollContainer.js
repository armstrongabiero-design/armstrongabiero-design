import React, { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Wide-content wrapper with a horizontal scrollbar pinned to the bottom of the
 * visible screen while any part of the section is on screen.
 *
 * The content scrolls natively (trackpad, shift+wheel, keyboard); the pinned bar
 * mirrors it, and dragging the bar scrolls the content. The bar only appears
 * when the content is actually wider than the section.
 *
 * Do not put this inside an ancestor with overflow hidden/auto other than the
 * page or dialog scroller: `position: sticky` sticks to the nearest scroller.
 */
export default function HorizontalScrollContainer({ children, className = '', contentClassName = '', ...rest }) {
  const contentRef = useRef(null);
  const barRef = useRef(null);
  const spacerRef = useRef(null);
  const frame = useRef(0);
  const [overflowing, setOverflowing] = useState(false);

  const measure = useCallback(() => {
    frame.current = 0;
    const content = contentRef.current;
    const spacer = spacerRef.current;
    if (!content || !spacer) return;
    spacer.style.width = `${content.scrollWidth}px`;
    setOverflowing(content.scrollWidth - content.clientWidth > 1);
    if (barRef.current && barRef.current.scrollLeft !== content.scrollLeft) {
      barRef.current.scrollLeft = content.scrollLeft;
    }
  }, []);

  const scheduleMeasure = useCallback(() => {
    if (!frame.current) frame.current = window.requestAnimationFrame(measure);
  }, [measure]);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return undefined;
    measure();

    // Resize of the section itself, or of the table inside it.
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleMeasure) : null;
    const observeChildren = () => {
      if (!ro) return;
      ro.disconnect();
      ro.observe(content);
      Array.from(content.children).forEach((child) => ro.observe(child));
    };
    observeChildren();

    // Rows/columns rendered after data loads, tables swapped in after a spinner.
    const mo = typeof MutationObserver !== 'undefined'
      ? new MutationObserver(() => { observeChildren(); scheduleMeasure(); })
      : null;
    if (mo) mo.observe(content, { childList: true, subtree: true, characterData: true });

    window.addEventListener('resize', scheduleMeasure);
    return () => {
      if (ro) ro.disconnect();
      if (mo) mo.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      if (frame.current) window.cancelAnimationFrame(frame.current);
      frame.current = 0;
    };
  }, [measure, scheduleMeasure]);

  const onContentScroll = () => {
    const bar = barRef.current;
    const content = contentRef.current;
    if (bar && content && bar.scrollLeft !== content.scrollLeft) bar.scrollLeft = content.scrollLeft;
  };

  const onBarScroll = () => {
    const bar = barRef.current;
    const content = contentRef.current;
    if (bar && content && content.scrollLeft !== bar.scrollLeft) content.scrollLeft = bar.scrollLeft;
  };

  return (
    <div className={`hscroll ${overflowing ? 'hscroll--overflowing' : ''} ${className}`.trim()} {...rest}>
      <div ref={contentRef} onScroll={onContentScroll} className={`hscroll__content ${contentClassName}`.trim()}>
        {children}
      </div>
      <div className="hscroll__bar" hidden={!overflowing} aria-hidden="true">
        <div ref={barRef} onScroll={onBarScroll} className="hscroll__track">
          <div ref={spacerRef} className="hscroll__spacer" />
        </div>
      </div>
    </div>
  );
}
