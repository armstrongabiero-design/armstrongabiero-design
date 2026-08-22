import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Enhances every .table-container on the page with a sticky bottom horizontal scrollbar.
 * Runs after route changes so all module tables get consistent wide-table navigation.
 */
export default function TableScrollEnhancer() {
  const location = useLocation();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      document.querySelectorAll('.table-container:not([data-hscroll-ready])').forEach((container) => {
        if (container.dataset.hscrollReady === '1') return;
        container.dataset.hscrollReady = '1';

        const top = document.createElement('div');
        top.className = 'horizontal-scroll-top overflow-x-auto overflow-y-visible';
        while (container.firstChild) {
          top.appendChild(container.firstChild);
        }

        const barWrap = document.createElement('div');
        barWrap.className = 'horizontal-scroll-bar sticky bottom-0 z-10 bg-white/95 border-t border-slate-200';

        const bar = document.createElement('div');
        bar.className = 'overflow-x-auto h-3.5';
        bar.setAttribute('aria-label', 'Horizontal scroll');

        const spacer = document.createElement('div');
        spacer.style.height = '1px';
        bar.appendChild(spacer);
        barWrap.appendChild(bar);

        container.classList.add('horizontal-scroll-wrap', 'p-0');
        container.style.overflow = 'visible';
        container.appendChild(top);
        container.appendChild(barWrap);

        const syncWidth = () => {
          spacer.style.width = `${top.scrollWidth}px`;
        };

        let syncing = false;
        top.addEventListener('scroll', () => {
          if (syncing) return;
          syncing = true;
          bar.scrollLeft = top.scrollLeft;
          syncing = false;
        });
        bar.addEventListener('scroll', () => {
          if (syncing) return;
          syncing = true;
          top.scrollLeft = bar.scrollLeft;
          syncing = false;
        });

        syncWidth();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(syncWidth) : null;
        if (ro) ro.observe(top);
        window.addEventListener('resize', syncWidth);
      });
    }, 50);

    return () => window.clearTimeout(timer);
  }, [location.pathname, location.search]);

  return null;
}
