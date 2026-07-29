import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Download, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

function detectKind(contentType = '', filename = '') {
  const ct = (contentType || '').toLowerCase();
  const name = (filename || '').toLowerCase();
  if (ct.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/.test(name)) return 'image';
  if (ct.includes('pdf') || name.endsWith('.pdf')) return 'pdf';
  if (
    ct.includes('spreadsheet') ||
    ct.includes('excel') ||
    /\.(xlsx|xls|csv)$/.test(name)
  ) return 'spreadsheet';
  if (
    ct.includes('word') ||
    ct.includes('officedocument.wordprocessing') ||
    /\.(docx|doc)$/.test(name)
  ) return 'word';
  if (
    ct.includes('presentation') ||
    /\.(pptx|ppt)$/.test(name)
  ) return 'presentation';
  return 'other';
}

/**
 * In-page modal preview for documents / attachments.
 * Pass either `url` (absolute or /api/...) or `fetcher` async () => Blob|ArrayBuffer.
 */
export default function FilePreviewModal({
  open,
  onOpenChange,
  url,
  filename = 'file',
  contentType = '',
  authToken,
  title = 'File preview',
}) {
  const [blobUrl, setBlobUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [htmlPreview, setHtmlPreview] = useState('');
  const [tablePreview, setTablePreview] = useState(null);
  const [error, setError] = useState('');

  const kind = useMemo(() => detectKind(contentType, filename), [contentType, filename]);

  useEffect(() => {
    if (!open || !url) return undefined;
    let revoked = null;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError('');
      setHtmlPreview('');
      setTablePreview(null);
      try {
        const absolute = url.startsWith('http') ? url : `${BACKEND_URL}${url}`;
        const headers = {};
        if (authToken && !url.startsWith('http')) {
          headers.Authorization = `Bearer ${authToken}`;
        } else if (authToken && absolute.includes('/api/')) {
          headers.Authorization = `Bearer ${authToken}`;
        }

        const response = await axios.get(absolute, {
          responseType: 'blob',
          headers,
        });
        if (cancelled) return;
        const blob = response.data;
        const objectUrl = URL.createObjectURL(blob);
        revoked = objectUrl;
        setBlobUrl(objectUrl);

        if (kind === 'word') {
          try {
            const mammoth = await import('mammoth/mammoth.browser');
            const arrayBuffer = await blob.arrayBuffer();
            const result = await mammoth.convertToHtml({ arrayBuffer });
            if (!cancelled) setHtmlPreview(result.value || '<p>(empty document)</p>');
          } catch {
            if (!cancelled) setError('Word preview unavailable. You can download the file.');
          }
        } else if (kind === 'spreadsheet') {
          try {
            const XLSX = await import('xlsx');
            const arrayBuffer = await blob.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
            if (!cancelled) setTablePreview({ sheetName, rows: rows.slice(0, 100) });
          } catch {
            if (!cancelled) setError('Spreadsheet preview unavailable. You can download the file.');
          }
        }
      } catch {
        if (!cancelled) {
          setError('Could not load file for preview');
          toast.error('Could not load file for preview');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
      setBlobUrl(null);
    };
  }, [open, url, authToken, kind]);

  const download = () => {
    if (!blobUrl) return;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename || 'download';
    a.click();
  };

  const officeOnlineUrl =
    url && url.startsWith('https://') && (kind === 'word' || kind === 'spreadsheet' || kind === 'presentation')
      ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl w-[95vw] h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="truncate">{filename}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2 mb-2">
          <Button type="button" variant="outline" size="sm" onClick={download} disabled={!blobUrl}>
            <Download size={14} className="mr-1" />
            Download
          </Button>
          {url?.startsWith('http') && (
            <Button type="button" variant="outline" size="sm" asChild>
              <a href={url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={14} className="mr-1" />
                Open tab
              </a>
            </Button>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2">
          {loading && <p className="text-sm text-slate-500 p-4">Loading preview…</p>}
          {!loading && error && !htmlPreview && !tablePreview && kind !== 'image' && kind !== 'pdf' && (
            <p className="text-sm text-slate-600 p-4">{error}</p>
          )}
          {!loading && kind === 'image' && blobUrl && (
            <img src={blobUrl} alt={filename} className="max-w-full max-h-full mx-auto object-contain" />
          )}
          {!loading && kind === 'pdf' && blobUrl && (
            <iframe title={filename} src={blobUrl} className="w-full h-full min-h-[60vh] rounded" />
          )}
          {!loading && kind === 'word' && htmlPreview && (
            <div
              className="prose prose-sm max-w-none bg-white p-4 rounded"
              dangerouslySetInnerHTML={{ __html: htmlPreview }}
            />
          )}
          {!loading && kind === 'spreadsheet' && tablePreview && (
            <div className="overflow-auto">
              <p className="text-xs text-slate-500 mb-2">Sheet: {tablePreview.sheetName}</p>
              <table className="text-xs border-collapse w-full bg-white">
                <tbody>
                  {tablePreview.rows.map((row, ri) => (
                    <tr key={ri}>
                      {(row.length ? row : ['']).map((cell, ci) => (
                        <td key={ci} className="border border-slate-200 px-2 py-1 whitespace-nowrap">
                          {String(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!loading && officeOnlineUrl && !htmlPreview && !tablePreview && (kind === 'presentation' || error) && (
            <iframe title={filename} src={officeOnlineUrl} className="w-full h-full min-h-[60vh]" />
          )}
          {!loading && kind === 'other' && blobUrl && (
            <p className="text-sm text-slate-600 p-4">
              Inline preview is not available for this file type. Use Download to open it locally.
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
