import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Pencil, Trash2 } from 'lucide-react';
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
import { WORK_STATUS_OPTIONS, workStatusLabel } from '../utils/workStatus';
import { completeDialogSubmit } from '../utils/formUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitial = () => ({
  vehicle_id: '',
  workshop_type: 'INTERNAL',
  workshop_name: '',
  workshop_id: '',
  maintenance_record_id: '',
  description: '',
  start_date: new Date().toISOString().slice(0, 16),
  estimated_completion: new Date(Date.now() + 86400000).toISOString().slice(0, 16),
  cost: 0,
  currency: 'GHS',
  work_status: 'WORK_IN_PROGRESS',
  etc_datetime: '',
});

const Workshop = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'workshop_job');

  const [jobs, setJobs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [records, setRecords] = useState([]);
  const [masterWorkshops, setMasterWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(createInitial);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [jobsRes, vehiclesRes, recordsRes, workshopsRes] = await Promise.all([
        axios.get(`${API}/workshops`),
        axios.get(`${API}/vehicles`),
        axios.get(`${API}/maintenance`),
        axios.get(`${API}/master/workshops`, { params: { active_only: true } }).catch(() => ({ data: [] })),
      ]);
      setJobs(jobsRes.data);
      setVehicles(vehiclesRes.data);
      setRecords(recordsRes.data);
      setMasterWorkshops(workshopsRes.data || []);
    } catch {
      toast.error('Failed to load workshop jobs');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(createInitial());
    setDialogOpen(true);
  };

  const openEdit = (job) => {
    setEditingId(job.id);
    setFormData({
      vehicle_id: job.vehicle_id,
      workshop_type: job.workshop_type || 'INTERNAL',
      workshop_name: job.workshop_name || '',
      workshop_id: job.workshop_id || '',
      maintenance_record_id: job.maintenance_record_id || '',
      description: job.description || '',
      start_date: job.start_date ? new Date(job.start_date).toISOString().slice(0, 16) : '',
      estimated_completion: job.estimated_completion ? new Date(job.estimated_completion).toISOString().slice(0, 16) : '',
      cost: job.cost ?? 0,
      currency: job.currency || 'GHS',
      work_status: job.work_status || 'WORK_IN_PROGRESS',
      etc_datetime: job.etc_datetime ? new Date(job.etc_datetime).toISOString().slice(0, 16) : '',
    });
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setFormData(createInitial());
    }
  };

  const onMasterWorkshopChange = (id) => {
    if (id === 'NONE') {
      setFormData({ ...formData, workshop_id: '', workshop_name: formData.workshop_name });
      return;
    }
    const ws = masterWorkshops.find((w) => w.id === id);
    setFormData({
      ...formData,
      workshop_id: id,
      workshop_name: ws?.name || formData.workshop_name,
      workshop_type: ws?.workshop_type || formData.workshop_type,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.work_status === 'ETC' && !formData.etc_datetime) {
      toast.error('ETC datetime is required for this work status');
      return;
    }
    if (!formData.workshop_name.trim()) {
      toast.error('Workshop name is required');
      return;
    }
    const payload = {
      ...formData,
      workshop_id: formData.workshop_id || null,
      maintenance_record_id: formData.maintenance_record_id || null,
      start_date: new Date(formData.start_date).toISOString(),
      estimated_completion: new Date(formData.estimated_completion).toISOString(),
      cost: parseFloat(formData.cost),
      etc_datetime: formData.etc_datetime ? new Date(formData.etc_datetime).toISOString() : null,
    };
    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/workshops/${editingId}`, payload)
          : axios.post(`${API}/workshops`, payload),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: createInitial,
      onSuccess: fetchData,
      successMessage: editingId ? 'Workshop job updated' : 'Workshop job created',
      errorMessage: editingId ? 'Failed to update job' : 'Failed to create job',
    });
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/workshops/${deleteTarget.id}`);
      toast.success('Workshop job deleted');
      setDeleteTarget(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <div className="p-8 text-center">Loading workshop jobs...</div>;
  if (!canEdit) return <div className="p-8 text-center text-slate-600">Staff access required</div>;

  return (
    <div className="p-6 lg:p-8" data-testid="workshop-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Workshop / Garage</h1>
          <p className="text-slate-600 mt-1">Manage workshop jobs linked to maintenance operations</p>
        </div>
        <Button onClick={openCreate} data-testid="add-workshop-job-btn">
          <Plus size={18} className="mr-2" />
          Add Job
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Workshop Job' : 'New Workshop Job'}</DialogTitle>
            <DialogDescription>Track work performed at a workshop or garage.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Vehicle *</Label>
              <Select value={formData.vehicle_id} onValueChange={(v) => setFormData({ ...formData, vehicle_id: v })}>
                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                <SelectContent>
                  {vehicles.map((v) => (
                    <SelectItem key={v.id} value={v.id}>{v.registration_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Master Workshop</Label>
              <Select value={formData.workshop_id || 'NONE'} onValueChange={onMasterWorkshopChange}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None (enter name below)</SelectItem>
                  {masterWorkshops.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Type</Label>
                <Select value={formData.workshop_type} onValueChange={(v) => setFormData({ ...formData, workshop_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INTERNAL">Internal</SelectItem>
                    <SelectItem value="EXTERNAL">External</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Workshop Name *</Label>
                <Input value={formData.workshop_name} onChange={(e) => setFormData({ ...formData, workshop_name: e.target.value })} required />
              </div>
            </div>
            <div>
              <Label>Linked Maintenance Record</Label>
              <Select
                value={formData.maintenance_record_id || 'NONE'}
                onValueChange={(v) => setFormData({ ...formData, maintenance_record_id: v === 'NONE' ? '' : v })}
              >
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {records.map((r) => {
                    const vehicle = vehicles.find((v) => v.id === r.vehicle_id);
                    return (
                      <SelectItem key={r.id} value={r.id}>
                        {(vehicle?.registration_number || 'Vehicle')} — {r.description?.slice(0, 40)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start</Label>
                <Input type="datetime-local" value={formData.start_date} onChange={(e) => setFormData({ ...formData, start_date: e.target.value })} required />
              </div>
              <div>
                <Label>Estimated Completion</Label>
                <Input type="datetime-local" value={formData.estimated_completion} onChange={(e) => setFormData({ ...formData, estimated_completion: e.target.value })} required />
              </div>
            </div>
            <div>
              <Label>Work Status</Label>
              <Select
                value={formData.work_status}
                onValueChange={(v) => setFormData({ ...formData, work_status: v, etc_datetime: v === 'ETC' ? formData.etc_datetime : '' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WORK_STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {formData.work_status === 'ETC' && (
              <div>
                <Label>ETC Datetime *</Label>
                <Input type="datetime-local" value={formData.etc_datetime} onChange={(e) => setFormData({ ...formData, etc_datetime: e.target.value })} required />
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Cost</Label>
                <Input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} required />
              </div>
              <div>
                <Label>Currency</Label>
                <Select value={formData.currency} onValueChange={(v) => setFormData({ ...formData, currency: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GHS">GHS</SelectItem>
                    <SelectItem value="LRD">LRD</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="STN">STN</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
              <Button type="submit">{editingId ? 'Save' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Workshop</th>
              <th>Description</th>
              <th>Start</th>
              <th>Est. Completion</th>
              <th>Cost (USD)</th>
              <th>Work Status</th>
              <th className="w-24">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-slate-500">No workshop jobs</td></tr>
            ) : (
              jobs.map((job) => {
                const vehicle = vehicles.find((v) => v.id === job.vehicle_id);
                return (
                  <tr key={job.id}>
                    <td className="font-semibold">{vehicle?.registration_number || 'N/A'}</td>
                    <td>{job.workshop_name}</td>
                    <td className="text-sm max-w-xs truncate">{job.description}</td>
                    <td>{job.start_date ? new Date(job.start_date).toLocaleString() : '—'}</td>
                    <td>{job.estimated_completion ? new Date(job.estimated_completion).toLocaleString() : '—'}</td>
                    <td>${Number(job.cost_usd || 0).toLocaleString()}</td>
                    <td><span className="status-badge">{workStatusLabel(job.work_status)}</span></td>
                    <td>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(job)}>
                          <Pencil size={16} />
                        </Button>
                        {canDelete && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteTarget(job)}>
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </td>
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
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete workshop job?"
        description={deleteTarget ? `Delete job at ${deleteTarget.workshop_name}?` : undefined}
      />
    </div>
  );
};

export default Workshop;
