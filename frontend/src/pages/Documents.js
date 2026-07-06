import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Sparkles, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import CountrySelect, { DEFAULT_COUNTRY_CODE, getCountryBadgeClass, getCountryLabel, normalizeCountryCode } from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialFormData = () => ({
  country: DEFAULT_COUNTRY_CODE,
  document_type: 'ROADWORTHY_CERT',
  entity_id: '',
  entity_type: 'VEHICLE',
  document_number: '',
  issue_date: new Date().toISOString().split('T')[0],
  expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  file_url: '',
});

const documentToFormData = (doc) => ({
  country: normalizeCountryCode(doc.country),
  document_type: doc.document_type,
  entity_id: doc.entity_id,
  entity_type: doc.entity_type,
  document_number: doc.document_number,
  issue_date: typeof doc.issue_date === 'string' ? doc.issue_date.split('T')[0] : new Date(doc.issue_date).toISOString().split('T')[0],
  expiry_date: typeof doc.expiry_date === 'string' ? doc.expiry_date.split('T')[0] : new Date(doc.expiry_date).toISOString().split('T')[0],
  file_url: doc.file_url,
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
  const [formData, setFormData] = useState(createInitialFormData);

  useEffect(() => {
    fetchData();
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

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setFormData(createInitialFormData());
    }
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setFormData(createInitialFormData());
    setDialogOpen(true);
  };

  const openEditDialog = (doc) => {
    setEditingId(doc.id);
    setFormData(documentToFormData(doc));
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      issue_date: new Date(formData.issue_date).toISOString(),
      expiry_date: new Date(formData.expiry_date).toISOString(),
    };
    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/documents/${editingId}`, payload)
          : axios.post(`${API}/documents`, payload),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: createInitialFormData,
      onSuccess: fetchData,
      successMessage: editingId ? 'Document updated successfully!' : 'Document added successfully!',
      errorMessage: editingId ? 'Failed to update document' : 'Failed to add document',
    });
    setEditingId(null);
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
      toast.error(error.response?.data?.detail || 'Failed to delete document');
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
          <p className="text-slate-600 mt-1">Manage compliance documents with AI OCR</p>
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
              <DialogDescription>Upload a compliance document for a vehicle or driver.</DialogDescription>
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
                <Label>File URL</Label>
                <Input value={formData.file_url} onChange={(e) => setFormData({ ...formData, file_url: e.target.value })} placeholder="https://..." required />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
                <Button type="submit">{editingId ? 'Save Changes' : 'Add Document'}</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
        )}
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Sparkles className="text-amber-600" size={20} />
        <div>
          <p className="font-semibold text-purple-800">AI OCR Available</p>
          <p className="text-sm text-amber-700">Upload documents for automatic data extraction and validation (Phase 2)</p>
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
              <th>OCR Status</th>
              <th>Valid</th>
              {canEdit && <th className="w-24">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 9 : 8} className="text-center py-8 text-slate-500">No documents found</td>
              </tr>
            ) : (
              documents.map((doc) => {
                const entity = doc.entity_type === 'VEHICLE'
                  ? vehicles.find((v) => v.id === doc.entity_id)
                  : drivers.find((d) => d.id === doc.entity_id);
                const isExpired = new Date(doc.expiry_date) < new Date();
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
                      {doc.ocr_processed ? (
                        <span className="status-badge active">Processed</span>
                      ) : (
                        <span className="status-badge inactive">Pending</span>
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
        description={deleteTarget ? `Permanently delete ${getDocumentTypeLabel(deleteTarget.document_type)} #${deleteTarget.document_number}?` : undefined}
      />
    </div>
  );
};

export default Documents;
