import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Sparkles, Pencil, Trash2, FileText, ExternalLink, ScanLine } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import CountrySelect, { DEFAULT_COUNTRY_CODE, getCountryBadgeClass, getCountryLabel, normalizeCountryCode } from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const ACCEPTED_FILE_TYPES = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';

/** Log implementation details for developers — never show these in the UI. */
const logDocumentsDev = (message, ...args) => {
  console.debug(`[GTI Fleet Documents] ${message}`, ...args);
};

const userFacingOcrMessage = (technicalError) => {
  if (technicalError) {
    logDocumentsDev('OCR unavailable or failed:', technicalError);
  }
  return 'Automatic scanning could not read this document. You can enter the details manually or try another file.';
};

const userFacingApiError = (error, fallback) => {
  const detail = error?.response?.data?.detail;
  if (detail) {
    logDocumentsDev('API error:', detail);
  }
  if (typeof detail === 'string' && detail.length < 120 && !/EMERGENT|S3_|AWS_|mongodb|traceback/i.test(detail)) {
    return detail;
  }
  return fallback;
};

const createInitialFormData = () => ({
  country: DEFAULT_COUNTRY_CODE,
  document_type: 'ROADWORTHY_CERT',
  entity_id: '',
  entity_type: 'VEHICLE',
  document_number: '',
  issue_date: new Date().toISOString().split('T')[0],
  expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
});

const documentToFormData = (doc) => ({
  country: normalizeCountryCode(doc.country),
  document_type: doc.document_type,
  entity_id: doc.entity_id,
  entity_type: doc.entity_type,
  document_number: doc.document_number,
  issue_date: typeof doc.issue_date === 'string' ? doc.issue_date.split('T')[0] : new Date(doc.issue_date).toISOString().split('T')[0],
  expiry_date: typeof doc.expiry_date === 'string' ? doc.expiry_date.split('T')[0] : new Date(doc.expiry_date).toISOString().split('T')[0],
});

const Documents = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'document');

  const [documents, setDocuments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [runOcrOnUpload, setRunOcrOnUpload] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ocrRunningId, setOcrRunningId] = useState(null);
  const [formData, setFormData] = useState(createInitialFormData);

  useEffect(() => {
    fetchData();
    logDocumentsDev(
      'Storage uses S3 when S3_BUCKET_NAME is set on the API; otherwise local disk. OCR requires EMERGENT_LLM_KEY on the backend.'
    );
  }, []);

  const fetchData = async () => {
    try {
      const [docsRes, vehiclesRes, driversRes] = await Promise.all([
        axios.get(`${API}/documents`),
        axios.get(`${API}/vehicles`),
        axios.get(`${API}/drivers`),
      ]);
      setDocuments(docsRes.data);
      setVehicles(vehiclesRes.data);
      setDrivers(driversRes.data);
    } catch {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const resetDialogState = () => {
    setEditingId(null);
    setFormData(createInitialFormData());
    setSelectedFile(null);
    setRunOcrOnUpload(true);
  };

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) resetDialogState();
  };

  const openCreateDialog = () => {
    resetDialogState();
    setDialogOpen(true);
  };

  const openEditDialog = (doc) => {
    setEditingId(doc.id);
    setFormData(documentToFormData(doc));
    setSelectedFile(null);
    setRunOcrOnUpload(false);
    setDialogOpen(true);
  };

  const uploadFileForDocument = async (documentId, file) => {
    const uploadData = new FormData();
    uploadData.append('file', file);
    await axios.post(`${API}/documents/${documentId}/upload`, uploadData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  };

  const runOcrForDocument = async (documentId) => {
    const response = await axios.post(`${API}/documents/${documentId}/ocr`);
    return response.data;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingId && !selectedFile) {
      toast.error('Please select a document file to upload');
      return;
    }

    const payload = {
      ...formData,
      issue_date: new Date(formData.issue_date).toISOString(),
      expiry_date: new Date(formData.expiry_date).toISOString(),
    };

    setUploading(true);
    try {
      let documentId = editingId;
      if (editingId) {
        await axios.put(`${API}/documents/${editingId}`, payload);
      } else {
        const createRes = await axios.post(`${API}/documents`, payload);
        documentId = createRes.data.id;
      }

      if (selectedFile) {
        await uploadFileForDocument(documentId, selectedFile);
      }

      if (runOcrOnUpload && (selectedFile || editingId)) {
        try {
          const ocrResult = await runOcrForDocument(documentId);
          if (ocrResult?.error) {
            toast.warning(`Document saved. ${userFacingOcrMessage(ocrResult.error)}`);
          } else {
            toast.success('Document saved and OCR completed');
          }
        } catch {
          toast.warning('Document saved, but OCR could not be completed');
        }
      } else {
        toast.success(editingId ? 'Document updated successfully!' : 'Document added successfully!');
      }

      handleDialogOpenChange(false);
      fetchData();
    } catch (error) {
      toast.error(userFacingApiError(error, editingId ? 'Failed to update document' : 'Failed to add document'));
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async (doc) => {
    if (!doc.s3_key && !doc.file_url) {
      toast.error('No file uploaded for this document');
      return;
    }
    try {
      const { data } = await axios.get(`${API}/documents/${doc.id}/download-url`);
      const url = data.url.startsWith('http') ? data.url : `${BACKEND_URL}${data.url}`;
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Could not open document');
    }
  };

  const handleRunOcr = async (doc) => {
    setOcrRunningId(doc.id);
    try {
      const ocrResult = await runOcrForDocument(doc.id);
      if (ocrResult?.error) {
        toast.error(userFacingOcrMessage(ocrResult.error));
      } else {
        toast.success('Document details updated from scan');
        fetchData();
      }
    } catch (error) {
      toast.error(userFacingApiError(error, 'Scan could not be completed'));
    } finally {
      setOcrRunningId(null);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/documents/${deleteTarget.id}`);
      toast.success('Document deleted');
      setDeleteTarget(null);
      fetchData();
    } catch (error) {
      toast.error(userFacingApiError(error, 'Failed to delete document'));
    } finally {
      setDeleting(false);
    }
  };

  const getDocumentTypeLabel = (type) => {
    const labels = {
      ROADWORTHY_CERT: 'Roadworthy Certificate',
      INSURANCE: 'Insurance',
      DRIVER_LICENSE: 'Driver License',
      VEHICLE_REGISTRATION: 'Registration',
      OTHER: 'Other',
    };
    return labels[type] || type;
  };

  return (
    <div className="p-6 lg:p-8" data-testid="documents-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Documents</h1>
          <p className="text-slate-600 mt-1">Manage compliance documents for vehicles and drivers</p>
        </div>
        {canEdit && (
        <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
          <DialogTrigger asChild>
            <Button data-testid="add-document-btn" onClick={openCreateDialog}>
              <Plus size={18} className="mr-2" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? 'Edit Document' : 'Add Document'}</DialogTitle>
              <DialogDescription>
                {editingId
                  ? 'Update document details or replace the uploaded file.'
                  : 'Add a compliance document for a vehicle or driver.'}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Country</Label>
                <CountrySelect
                  value={formData.country}
                  onValueChange={(value) => setFormData({ ...formData, country: value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Document Type</Label>
                  <Select value={formData.document_type} onValueChange={(value) => setFormData({ ...formData, document_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ROADWORTHY_CERT">Roadworthy Cert</SelectItem>
                      <SelectItem value="INSURANCE">Insurance</SelectItem>
                      <SelectItem value="DRIVER_LICENSE">Driver License</SelectItem>
                      <SelectItem value="VEHICLE_REGISTRATION">Registration</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Entity Type</Label>
                  <Select value={formData.entity_type} onValueChange={(value) => setFormData({ ...formData, entity_type: value, entity_id: '' })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VEHICLE">Vehicle</SelectItem>
                      <SelectItem value="DRIVER">Driver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{formData.entity_type === 'VEHICLE' ? 'Vehicle' : 'Driver'}</Label>
                <Select value={formData.entity_id} onValueChange={(value) => setFormData({ ...formData, entity_id: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {formData.entity_type === 'VEHICLE'
                      ? vehicles.map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {v.registration_number} - {v.make} {v.model}
                          </SelectItem>
                        ))
                      : drivers.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.first_name} {d.last_name}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Document Number</Label>
                <Input value={formData.document_number} onChange={(e) => setFormData({ ...formData, document_number: e.target.value })} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Issue Date</Label>
                  <Input type="date" value={formData.issue_date} onChange={(e) => setFormData({ ...formData, issue_date: e.target.value })} required />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input type="date" value={formData.expiry_date} onChange={(e) => setFormData({ ...formData, expiry_date: e.target.value })} required />
                </div>
              </div>
              <div>
                <Label>{editingId ? 'Replace File (optional)' : 'Document File'}</Label>
                <Input
                  type="file"
                  accept={ACCEPTED_FILE_TYPES}
                  onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                  required={!editingId}
                />
                <p className="text-xs text-slate-500 mt-1">PDF or image, max 10 MB</p>
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={runOcrOnUpload}
                  onChange={(e) => setRunOcrOnUpload(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <Sparkles size={14} className="text-amber-600" />
                Run automatic scan after upload (fill in number and dates when possible)
              </label>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
                <Button type="submit" disabled={uploading}>
                  {uploading ? 'Saving…' : editingId ? 'Save Changes' : 'Upload Document'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Sparkles className="text-amber-600 shrink-0" size={20} />
        <div>
          <p className="font-semibold text-amber-900">Automatic document scanning</p>
          <p className="text-sm text-amber-800">
            Upload a file to keep it with the record. Turn on scanning to pull document number and dates from the image when possible.
          </p>
        </div>
      </div>

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Entity</th>
              <th>Document #</th>
              <th>Country</th>
              <th>Issue Date</th>
              <th>Expiry Date</th>
              <th>File</th>
              <th>OCR Status</th>
              <th>Valid</th>
              {canEdit && <th className="w-32">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 10 : 9} className="text-center py-8 text-slate-500">No documents found</td>
              </tr>
            ) : (
              documents.map((doc) => {
                const entity = doc.entity_type === 'VEHICLE'
                  ? vehicles.find((v) => v.id === doc.entity_id)
                  : drivers.find((d) => d.id === doc.entity_id);
                const isExpired = new Date(doc.expiry_date) < new Date();
                const hasFile = !!(doc.s3_key || doc.file_url);
                return (
                  <tr key={doc.id}>
                    <td><span className="status-badge">{getDocumentTypeLabel(doc.document_type)}</span></td>
                    <td className="font-semibold">
                      {doc.entity_type === 'VEHICLE'
                        ? entity?.registration_number
                        : `${entity?.first_name} ${entity?.last_name}`}
                    </td>
                    <td className="text-xs font-mono">{doc.document_number}</td>
                    <td><span className={getCountryBadgeClass(doc.country)}>{getCountryLabel(doc.country)}</span></td>
                    <td>{new Date(doc.issue_date).toLocaleDateString()}</td>
                    <td className={isExpired ? 'text-red-600 font-semibold' : ''}>
                      {new Date(doc.expiry_date).toLocaleDateString()}
                    </td>
                    <td>
                      {hasFile ? (
                        <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleViewDocument(doc)}>
                          <FileText size={14} className="mr-1" />
                          View
                          <ExternalLink size={12} className="ml-1 opacity-60" />
                        </Button>
                      ) : (
                        <span className="text-slate-400 text-sm">—</span>
                      )}
                    </td>
                    <td>
                      {doc.ocr_processed ? (
                        <span className="status-badge active">Processed</span>
                      ) : hasFile ? (
                        <span className="status-badge inactive">Pending</span>
                      ) : (
                        <span className="text-slate-400 text-sm">No file</span>
                      )}
                    </td>
                    <td>
                      {doc.validated ? (
                        <span className="status-badge active">Valid</span>
                      ) : isExpired ? (
                        <span className="status-badge maintenance">Expired</span>
                      ) : (
                        <span className="status-badge inactive">Unvalidated</span>
                      )}
                    </td>
                    {canEdit && (
                      <td>
                        <div className="flex gap-1">
                          {hasFile && !doc.ocr_processed && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Run OCR"
                              disabled={ocrRunningId === doc.id}
                              onClick={() => handleRunOcr(doc)}
                            >
                              <ScanLine size={16} className="text-amber-600" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(doc)}>
                            <Pencil size={16} />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(doc)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="Delete document?"
        description={deleteTarget ? `Permanently delete ${getDocumentTypeLabel(deleteTarget.document_type)} #${deleteTarget.document_number}? The stored file will also be removed.` : undefined}
      />
    </div>
  );
};

export default Documents;
