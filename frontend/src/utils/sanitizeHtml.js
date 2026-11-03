import DOMPurify from 'dompurify';

/**
 * Clean HTML converted from an uploaded document before it is rendered.
 * Mammoth does not sanitise its output, so a document can carry javascript: links.
 */
export function sanitizeDocumentHtml(html) {
  return DOMPurify.sanitize(html || '', {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'textarea', 'select'],
    FORBID_ATTR: ['style'],
  });
}
