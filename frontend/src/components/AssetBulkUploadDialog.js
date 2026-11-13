import React, { useState } from 'react';
import axios from 'axios';
import { CheckCircle2, Download, AlertTriangle, MinusCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

function ResultList({ icon: Icon, title, rows, tone }) {
  if (!rows?.length) return null;
  return (
    <div>
      <p className={`flex items-center gap-1.5 font-medium ${tone}`}>
        <Icon size={15} aria-hidden /> {title} ({rows.length})
      </p>
      <ul className="mt-1 max-h-32 overflow-y-auto space-y-0.5 text-slate-700">
        {rows.map((r, i) => (
          <li key={`${r.row}-${i}`}>
            {r.row ? `Row ${r.row}` : 'File'}
            {r.registration_number ? ` · ${r.registration_number}` : ''}
            {r.message ? `: ${r.message}` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Import many assets from the Excel or CSV template, then show what was imported, skipped and rejected. */
export default function AssetBulkUploadDialog({ open, onOpenChange, onImported }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const close = (next) => {
    onOpenChange(next);
    if (!next) {
      setFile(null);
      setResult(null);
    }
  };

  const downloadTemplate = async () => {
    try {
      const response = await axios.get(`${API}/assets/bulk-upload/template`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'asset-import-template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download the template');
    }
  };

  const upload = async (e) => {
    e.preventDefault();
    if (!file) {
      toast.error('Choose an Excel or CSV file first');
      return;
    }
    const body = new FormData();
    body.append('file', file);
    setUploading(true);
    setResult(null);
    try {
      const { data } = await axios.post(`${API}/assets/bulk-upload`, body, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setResult(data);
      if (data.created > 0) {
        toast.success(`${data.created} asset${data.created === 1 ? '' : 's'} imported`);
        onImported?.();
      } else {
        toast.warning('No assets were imported. See the details in the dialog.');
      }
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Bulk Upload Assets</DialogTitle>
          <DialogDescription>
            Each row is one vehicle's asset record, matched by registration number. Vehicles that already have an
            asset record are skipped.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={upload} className="space-y-4">
          <Button type="button" variant="outline" className="w-full" onClick={downloadTemplate} data-testid="asset-template-btn">
            <Download size={16} className="mr-2" />
            Download template (.xlsx)
          </Button>
          <div>
            <Label htmlFor="asset-bulk-file">Excel or CSV file</Label>
            <Input
              id="asset-bulk-file"
              type="file"
              accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setResult(null);
              }}
              data-testid="asset-bulk-file"
            />
            <p className="text-xs text-slate-500 mt-1">
              Columns: Vehicle Registration, Acquisition Date, Acquisition Cost, Currency (required); Depreciation
              Rate (%) and Current Value (optional). Max 5 MB.
            </p>
          </div>

          {result && (
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-3" data-testid="asset-bulk-result" aria-live="polite">
              <p className="font-medium text-slate-800">
                Imported {result.created} · Skipped {result.skipped} · Failed {result.failed}
              </p>
              <ResultList icon={CheckCircle2} title="Imported" rows={result.records} tone="text-green-700" />
              <ResultList icon={MinusCircle} title="Skipped (already in the system)" rows={result.skipped_rows} tone="text-slate-700" />
              <ResultList icon={AlertTriangle} title="Not imported — fix and upload these rows again" rows={result.errors} tone="text-red-700" />
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Close
            </Button>
            <Button type="submit" disabled={uploading || !file} data-testid="asset-bulk-submit">
              {uploading ? 'Importing…' : 'Upload & import'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
