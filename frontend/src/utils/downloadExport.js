import axios from 'axios';

/**
 * Download a blob export from an API endpoint.
 * @param {object} opts
 * @param {string} opts.url
 * @param {object} [opts.params]
 * @param {object} [opts.headers]
 * @param {string} opts.filenameFallback
 */
export async function downloadExport({ url, params = {}, headers = {}, filenameFallback }) {
  const response = await axios.get(url, {
    params,
    headers,
    responseType: 'blob',
  });
  const disposition = response.headers['content-disposition'] || '';
  const match = disposition.match(/filename="?([^"]+)"?/i);
  const filename = match?.[1] || filenameFallback || 'export.bin';
  const blobUrl = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(blobUrl);
}
