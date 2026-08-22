import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, AlertTriangle, Pencil, Trash2, Paperclip, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';
import { safetyScoreTextClass, safetyScoreBarClass, safetyScoreLabel } from '../utils/safetyScore';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialFormData = () => ({
  driver_id: '',
  vehicle_id: '',
  incident_date: new Date().toISOString().split('T')[0],
  incident_type: '',
  severity: 'MEDIUM',
  description: '',
  location: '',
  cost: 0,
  currency: 'GHS',
});

const incidentToFormData = (incident) => ({
  driver_id: incident.driver_id,
  vehicle_id: incident.vehicle_id,
  incident_date: new Date(incident.incident_date).toISOString().split('T')[0],
  incident_type: incident.incident_type,
  severity: incident.severity,
  description: incident.description,
  location: incident.location,
  cost: incident.cost || 0,
  currency: incident.currency || 'GHS',
});

const Safety = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'safety_incident');

  const [incidents, setIncidents] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState(createInitialFormData);
  const [pendingEvidence, setPendingEvidence] = useState([]);
  const [evidenceDialog, setEvidenceDialog] = useState(null);
  const [evidenceUploading, setEvidenceUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [incidentsRes, driversRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/safety/incidents`),
        axios.get(`${API}/drivers`),
        axios.get(`${API}/vehicles`),
      ]);
      setIncidents(incidentsRes.data);
      setDrivers(driversRes.data);
      setVehicles(vehiclesRes.data);
    } catch (error) {
      toast.error('Failed to load safety data');
    } finally {
      setLoading(false);
    }
  };

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setFormData(createInitialFormData());
      setPendingEvidence([]);
    }
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setFormData(createInitialFormData());
    setDialogOpen(true);
  };

  const openEditDialog = (incident) => {
    setEditingId(incident.id);
    setFormData(incidentToFormData(incident));
    setDialogOpen(true);
  };

  const buildPayload = () => ({
    ...formData,
    incident_date: new Date(formData.incident_date).toISOString(),
    cost: formData.cost ? parseFloat(formData.cost) : null,
  });

  const uploadEvidenceFiles = async (incidentId, files) => {
    for (const file of files) {
      const uploadData = new FormData();
      uploadData.append('file', file);
      await axios.post(`${API}/safety/incidents/${incidentId}/evidence`, uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      let incidentId = editingId;
      if (editingId) {
        await axios.put(`${API}/safety/incidents/${editingId}`, buildPayload());
      } else {
        const { data } = await axios.post(`${API}/safety/incidents`, buildPayload());
        incidentId = data.id;
      }
      if (pendingEvidence.length > 0 && incidentId) {
        await uploadEvidenceFiles(incidentId, pendingEvidence);
      }
      toast.success(
        editingId
          ? 'Incident updated.'
          : `Incident recorded${pendingEvidence.length ? ' with evidence' : ''}. Driver safety score updated.`
      );
      handleDialogOpenChange(false);
      fetchData();
    } catch {
      toast.error(editingId ? 'Failed to update incident' : 'Failed to record incident');
    }
  };

  const handleEvidenceUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    if (!evidenceDialog?.id) {
      setPendingEvidence((prev) => [...prev, ...files]);
      toast.success(`${files.length} file(s) queued for upload`);
      e.target.value = '';
      return;
    }
    setEvidenceUploading(true);
    try {
      await uploadEvidenceFiles(evidenceDialog.id, files);
      toast.success('Evidence uploaded');
      e.target.value = '';
      fetchData();
      const refreshed = (await axios.get(`${API}/safety/incidents`)).data.find((i) => i.id === evidenceDialog.id);
      if (refreshed) setEvidenceDialog(refreshed);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Evidence upload failed');
    } finally {
      setEvidenceUploading(false);
    }
  };

  const evidenceUrl = (file) => {
    const ref = file.file_url || '';
    if (ref.startsWith('http')) return ref;
    return `${BACKEND_URL}${ref.startsWith('/') ? '' : '/'}${ref}`;
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/safety/incidents/${deleteTarget.id}`);
      toast.success('Incident deleted');
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete incident');
    } finally {
      setDeleting(false);
    }
  };

  const getSeverityBadge = (severity) => {
    const badges = {
      LOW: 'bg-green-100 text-green-800',
      MEDIUM: 'bg-amber-100 text-amber-800',
      HIGH: 'bg-red-100 text-red-800',
    };
    return `status-badge ${badges[severity] || ''}`;
  };

  return (
    <div className="p-6 lg:p-8" data-testid="safety-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Safety Management</h1>
          <p className="text-slate-600 mt-1">Track incidents and driver safety scores</p>
        </div>
        {canEdit && (
          <Button data-testid="add-incident-btn" onClick={openCreateDialog}>
            <Plus size={18} className="mr-2" />
            Report Incident
          </Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Safety Incident' : 'Report Safety Incident'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update incident details.' : 'Document a safety incident to update driver scores and records.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Driver</Label>
                <Select value={formData.driver_id} onValueChange={(value) => setFormData({...formData, driver_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver" />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.first_name} {d.last_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vehicle</Label>
                <Select value={formData.vehicle_id} onValueChange={(value) => setFormData({...formData, vehicle_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map(v => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.registration_number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Incident Date</Label>
              <Input type="date" value={formData.incident_date} onChange={(e) => setFormData({...formData, incident_date: e.target.value})} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Incident Type</Label>
                <Input value={formData.incident_type} onChange={(e) => setFormData({...formData, incident_type: e.target.value})} placeholder="e.g., Collision, Speeding" required />
              </div>
              <div>
                <Label>Severity</Label>
                <Select value={formData.severity} onValueChange={(value) => setFormData({...formData, severity: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
            </div>
            <div>
              <Label>Location</Label>
              <Input value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cost (optional)</Label>
                <Input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({...formData, cost: e.target.value})} />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={formData.currency} onValueChange={(value) => setFormData({...formData, currency: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GHS">GHS</SelectItem>
                    <SelectItem value="LRD">LRD</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="STN">STN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Evidence / Media (optional)</Label>
              <Input
                type="file"
                multiple
                accept="image/*,video/*,.pdf,.doc,.docx"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  if (files.length) setPendingEvidence((prev) => [...prev, ...files]);
                  e.target.value = '';
                }}
              />
              {pendingEvidence.length > 0 && (
                <ul className="text-xs text-slate-600 mt-2 space-y-1">
                  {pendingEvidence.map((f, i) => (
                    <li key={`${f.name}-${i}`} className="flex items-center gap-1">
                      <Paperclip size={12} /> {f.name}
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-slate-500 mt-1">Photos, videos, PDF, or Word documents.</p>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
              <Button type="submit">{editingId ? 'Save Changes' : 'Report Incident'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!evidenceDialog} onOpenChange={(open) => !open && setEvidenceDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Incident Evidence</DialogTitle>
            <DialogDescription>
              Supporting photos, videos, and documents linked to this incident.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {(evidenceDialog?.evidence_files || []).length === 0 ? (
              <p className="text-sm text-slate-500">No evidence uploaded yet.</p>
            ) : (
              <ul className="space-y-2">
                {evidenceDialog.evidence_files.map((file) => (
                  <li key={file.id} className="flex items-center justify-between text-sm border rounded p-2">
                    <span className="truncate mr-2">{file.filename}</span>
                    <a
                      href={evidenceUrl(file)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-amber-700 inline-flex items-center gap-1 shrink-0"
                    >
                      View <ExternalLink size={14} />
                    </a>
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div>
                <Label>Add evidence</Label>
                <Input
                  type="file"
                  multiple
                  accept="image/*,video/*,.pdf,.doc,.docx"
                  disabled={evidenceUploading}
                  onChange={handleEvidenceUpload}
                />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete safety incident?"
        description={deleteTarget ? `Permanently delete "${deleteTarget.incident_type}" incident? This cannot be undone.` : ''}
        onConfirm={handleDelete}
        loading={deleting}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {drivers.slice(0, 3).map(driver => (
          <div key={driver.id} className="fleet-card">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-slate-800">{driver.first_name} {driver.last_name}</h3>
                <p className="text-xs text-slate-500">{driver.license_number}</p>
              </div>
              <span className={`text-2xl font-bold ${safetyScoreTextClass(driver.safety_score)}`} title={safetyScoreLabel(driver.safety_score)}>
                {driver.safety_score}
              </span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${safetyScoreBarClass(driver.safety_score)}`}
                style={{width: `${driver.safety_score}%`}}
              ></div>
            </div>
            <p className="text-xs text-slate-600 mt-2">{driver.total_incidents} incidents</p>
          </div>
        ))}
      </div>

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Driver</th>
              <th>Vehicle</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Location</th>
              <th>Cost (USD)</th>
              <th>Evidence</th>
              {(canEdit || canDelete) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 ? (
              <tr>
                <td colSpan={(canEdit || canDelete) ? 9 : 8} className="text-center py-8 text-slate-500">No safety incidents recorded</td>
              </tr>
            ) : (
              incidents.map((incident) => {
                const driver = drivers.find(d => d.id === incident.driver_id);
                const vehicle = vehicles.find(v => v.id === incident.vehicle_id);
                return (
                  <tr key={incident.id}>
                    <td>{new Date(incident.incident_date).toLocaleDateString()}</td>
                    <td className="font-semibold">{driver?.first_name} {driver?.last_name}</td>
                    <td>{vehicle?.registration_number}</td>
                    <td>{incident.incident_type}</td>
                    <td>
                      <span className={getSeverityBadge(incident.severity)}>
                        {incident.severity === 'HIGH' && <AlertTriangle size={12} className="inline mr-1" />}
                        {incident.severity}
                      </span>
                    </td>
                    <td className="text-sm">{incident.location}</td>
                    <td>{incident.cost_usd ? `$${incident.cost_usd.toLocaleString()}` : '-'}</td>
                    <td>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 text-xs"
                        onClick={() => setEvidenceDialog(incident)}
                      >
                        <Paperclip size={14} className="mr-1" />
                        {(incident.evidence_files || []).length || 0}
                      </Button>
                    </td>
                    {(canEdit || canDelete) && (
                      <td>
                        <div className="flex gap-1">
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(incident)} aria-label="Edit incident">
                              <Pencil size={16} />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(incident)} aria-label="Delete incident">
                              <Trash2 size={16} className="text-red-600" />
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
    </div>
  );
};

export default Safety;
