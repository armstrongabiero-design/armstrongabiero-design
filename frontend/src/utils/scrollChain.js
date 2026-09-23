/**
 * When the cursor is over a nested scroll panel, allow the page (or nearest
 * scrollable ancestor) to keep scrolling if the panel cannot scroll further
 * (or has nothing to scroll).
 */
export function chainWheelToPage(event) {
  const el = event.currentTarget;
  if (!el) return;

  const { scrollTop, scrollHeight, clientHeight } = el;
  const canScroll = scrollHeight > clientHeight + 1;
  const delta = event.deltaY;
  if (!delta) return;

  const atTop = scrollTop <= 0;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

  if (!canScroll || (delta < 0 && atTop) || (delta > 0 && atBottom)) {
    event.preventDefault();
    let node = el.parentElement;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const oy = style.overflowY;
      const scrollable =
        (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
        node.scrollHeight > node.clientHeight + 1;
      if (scrollable) {
        node.scrollTop += delta;
        return;
      }
      node = node.parentElement;
    }
    window.scrollBy(0, delta);
  }
}
