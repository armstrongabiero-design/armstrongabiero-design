import React, { useCallback, useEffect, useState, useMemo } from 'react';
import axios from 'axios';
import { Plus, Sparkles, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditFleetRecord } from '../utils/permissions';
import { WORK_STATUS_OPTIONS, workStatusLabel } from '../utils/workStatus';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialFormData = () => ({
  vehicle_id: '',
  maintenance_type: 'ROUTINE',
  description: '',
  scheduled_date: new Date().toISOString().split('T')[0],
  next_due_date: '',
  next_service_odometer: '',
  odometer_at_maintenance: 0,
  cost: 0,
  currency: 'GHS',
  notes: '',
  work_status: 'WORK_IN_PROGRESS',
  etc_datetime: '',
  workshop_id: '',
});

const Maintenance = () => {
  const { user } = useAuth();
  const canBulkUpload = canEditFleetRecord(user?.role);
  const [searchParams] = useSearchParams();
  const workStatusFilter = searchParams.get('work_status') || '';

  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [masterWorkshops, setMasterWorkshops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [formData, setFormData] = useState(createInitialFormData);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const params = {};
      if (workStatusFilter) params.work_status = workStatusFilter;
      const requests = [
        axios.get(`${API}/maintenance`, { params }),
        axios.get(`${API}/vehicles`),
      ];
      if (canBulkUpload) {
        requests.push(axios.get(`${API}/master/workshops`, { params: { active_only: true } }).catch(() => ({ data: [] })));
      }
      const [recordsRes, vehiclesRes, workshopsRes] = await Promise.all(requests);
      setRecords(recordsRes.data);
      setVehicles(vehiclesRes.data);
      if (workshopsRes) setMasterWorkshops(workshopsRes.data || []);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [workStatusFilter, canBulkUpload]);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) setFormData(createInitialFormData());
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.work_status === 'ETC' && !formData.etc_datetime) {
      toast.error('ETC datetime is required for this work status');
      return;
    }
    const payload = {
      ...formData,
      scheduled_date: new Date(formData.scheduled_date).toISOString(),
      next_due_date: formData.next_due_date ? new Date(formData.next_due_date).toISOString() : null,
      next_service_odometer: formData.next_service_odometer !== '' ? parseFloat(formData.next_service_odometer) : null,
      odometer_at_maintenance: parseFloat(formData.odometer_at_maintenance),
      cost: parseFloat(formData.cost),
      etc_datetime: formData.etc_datetime ? new Date(formData.etc_datetime).toISOString() : null,
      workshop_id: formData.workshop_id || null,
    };
    await completeDialogSubmit({
      submit: () => axios.post(`${API}/maintenance`, payload),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: createInitialFormData,
      onSuccess: fetchData,
      successMessage: 'Maintenance record added!',
      errorMessage: 'Failed to add maintenance record',
    });
  };

  const predictMaintenance = async () => {
    if (!selectedVehicle) {
      toast.error('Please select a vehicle');
      return;
    }
    setPredicting(true);
    try {
      const response = await axios.post(`${API}/maintenance/predict/${selectedVehicle}`);
      toast.success(
        <div>
          <p className="font-semibold">AI Prediction Complete</p>
          <p className="text-sm mt-1">Priority: {response.data.priority}</p>
          <p className="text-xs mt-1">{response.data.predicted_issues?.join(', ')}</p>
        </div>
      );
    } catch {
      toast.error('Prediction failed');
    } finally {
      setPredicting(false);
    }
  };

  const typeLabel = (type) => {
    const labels = {
      PREDICTIVE: 'Predictive',
      CORRECTIVE: 'Corrective',
      ROUTINE: 'Routine',
      SCHEDULED: 'Routine',
      UNSCHEDULED: 'Corrective',
    };
    return labels[type] || type;
  };

  const resetBulkDialog = () => {
    setBulkFile(null);
    setBulkResult(null);
  };

  const handleBulkDialogOpenChange = (open) => {
    setBulkDialogOpen(open);
    if (!open) resetBulkDialog();
  };

  const downloadBulkTemplate = async () => {
    try {
      const response = await axios.get(`${API}/maintenance/bulk-upload/template`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'maintenance-import-template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download template');
    }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!bulkFile) {
      toast.error('Please select an Excel file to upload');
      return;
    }
    const uploadData = new FormData();
    uploadData.append('file', bulkFile);
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const { data } = await axios.post(`${API}/maintenance/bulk-upload`, uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBulkResult(data);
      if (data.created > 0) {
        fetchData();
        toast.success(`${data.created} record${data.created === 1 ? '' : 's'} imported`);
      }
      if (data.failed > 0 && data.created === 0) {
        toast.error('No records were imported. Review the errors below.');
      } else if (data.failed > 0) {
        toast.warning(`${data.failed} row${data.failed === 1 ? '' : 's'} could not be imported`);
      }
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Bulk upload failed');
    } finally {
      setBulkUploading(false);
    }
  };

  const filterBanner = useMemo(() => {
    if (workStatusFilter === 'incomplete') return 'Showing incomplete maintenance records';
    if (workStatusFilter) return `Filtered by work status: ${workStatusLabel(workStatusFilter)}`;
    return null;
  }, [workStatusFilter]);

  if (loading) {
    return <div className="p-8 text-center">Loading maintenance records...</div>;
  }

  return (
    <div className="p-6 lg:p-8" data-testid="maintenance-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Maintenance Records</h1>
          <p className="text-slate-600 mt-1">Track vehicle maintenance and upcoming due dates</p>
          {filterBanner && <p className="text-sm text-amber-700 mt-1">{filterBanner}</p>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="ai-predict-btn">
                <Sparkles size={18} className="mr-2" />
                AI Predict
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>AI Maintenance Prediction</DialogTitle>
                <DialogDescription>Select a vehicle to analyze its maintenance needs using AI.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Select Vehicle</Label>
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.registration_number} - {v.make} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={predictMaintenance} disabled={predicting} className="w-full">
                  {predicting ? 'Analyzing...' : 'Predict Maintenance Needs'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button data-testid="add-maintenance-btn">
                <Plus size={18} className="mr-2" />
                Add Record
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add Maintenance Record</DialogTitle>
                <DialogDescription>Record a new maintenance entry for a vehicle.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Vehicle</Label>
                  <Select value={formData.vehicle_id} onValueChange={(value) => setFormData({ ...formData, vehicle_id: value })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.registration_number} - {v.make} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={formData.maintenance_type} onValueChange={(value) => setFormData({ ...formData, maintenance_type: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PREDICTIVE">Predictive</SelectItem>
                      <SelectItem value="CORRECTIVE">Corrective</SelectItem>
                      <SelectItem value="ROUTINE">Routine</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Work Status</Label>
                  <Select
                    value={formData.work_status}
                    onValueChange={(value) => setFormData({ ...formData, work_status: value, etc_datetime: value === 'ETC' ? formData.etc_datetime : '' })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WORK_STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {formData.work_status === 'ETC' && (
                  <div>
                    <Label>Estimated Time of Completion *</Label>
                    <Input
                      type="datetime-local"
                      value={formData.etc_datetime}
                      onChange={(e) => setFormData({ ...formData, etc_datetime: e.target.value })}
                      required
                    />
                  </div>
                )}
                <div>
                  <Label>Description</Label>
                  <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Scheduled Date</Label>
                    <Input type="date" value={formData.scheduled_date} onChange={(e) => setFormData({ ...formData, scheduled_date: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Next Service Date</Label>
                    <Input type="date" value={formData.next_due_date} onChange={(e) => setFormData({ ...formData, next_due_date: e.target.value })} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Odometer at Service (km)</Label>
                    <Input type="number" value={formData.odometer_at_maintenance} onChange={(e) => setFormData({ ...formData, odometer_at_maintenance: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Next Service Odometer (km)</Label>
                    <Input type="number" value={formData.next_service_odometer} onChange={(e) => setFormData({ ...formData, next_service_odometer: e.target.value })} />
                  </div>
                </div>
                {masterWorkshops.length > 0 && (
                  <div>
                    <Label>Workshop / Garage</Label>
                    <Select
                      value={formData.workshop_id || 'NONE'}
                      onValueChange={(value) => setFormData({ ...formData, workshop_id: value === 'NONE' ? '' : value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Optional" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="NONE">None</SelectItem>
                        {masterWorkshops.map((w) => (
                          <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Cost</Label>
                    <Input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({ ...formData, cost: e.target.value })} required />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Select value={formData.currency} onValueChange={(value) => setFormData({ ...formData, currency: value })}>
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
                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
                  <Button type="submit">Add Record</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          {canBulkUpload && (
            <>
              <Button variant="outline" data-testid="bulk-upload-maintenance-btn" onClick={() => setBulkDialogOpen(true)}>
                <Upload size={18} className="mr-2" />
                Bulk Upload
              </Button>
              <Dialog open={bulkDialogOpen} onOpenChange={handleBulkDialogOpenChange}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Bulk Upload Maintenance Records</DialogTitle>
                    <DialogDescription>
                      Import multiple maintenance records from Excel. Match vehicles by registration number.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleBulkUpload} className="space-y-4">
                    <div>
                      <Button type="button" variant="outline" className="w-full" onClick={downloadBulkTemplate}>
                        <Download size={16} className="mr-2" />
                        Download sample template (.xlsx)
                      </Button>
                    </div>
                    <div>
                      <Label>Excel file</Label>
                      <Input
                        type="file"
                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                        required
                      />
                    </div>
                    {bulkResult && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
                        <p className="font-medium text-slate-800">
                          Imported {bulkResult.created} · Failed {bulkResult.failed}
                        </p>
                        {bulkResult.errors?.length > 0 && (
                          <ul className="max-h-32 overflow-y-auto text-red-700 space-y-1">
                            {bulkResult.errors.map((err, idx) => (
                              <li key={idx}>
                                {err.row ? `Row ${err.row}` : 'Import'}
                                {err.registration_number ? ` (${err.registration_number})` : ''}: {err.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => handleBulkDialogOpenChange(false)}>
                        Close
                      </Button>
                      <Button type="submit" disabled={bulkUploading}>
                        {bulkUploading ? 'Uploading…' : 'Upload & Import'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Type</th>
              <th>Description</th>
              <th>Scheduled Date</th>
              <th>Next Service Date</th>
              <th>Next Service Odo</th>
              <th>Odometer</th>
              <th>Cost (USD)</th>
              <th>Work Status</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan="9" className="text-center py-8 text-slate-500">No maintenance records</td>
              </tr>
            ) : (
              records.map((record) => {
                const vehicle = vehicles.find((v) => v.id === record.vehicle_id);
                const nextDue = record.next_due_date ? new Date(record.next_due_date) : null;
                const overdue = nextDue && nextDue < new Date();
                return (
                  <tr key={record.id}>
                    <td className="font-semibold">{vehicle?.registration_number || 'N/A'}</td>
                    <td><span className="status-badge">{typeLabel(record.maintenance_type)}</span></td>
                    <td className="text-sm">{record.description}</td>
                    <td>{new Date(record.scheduled_date).toLocaleDateString()}</td>
                    <td className={overdue ? 'text-red-600 font-semibold' : ''}>
                      {nextDue ? nextDue.toLocaleDateString() : '—'}
                    </td>
                    <td>
                      {record.next_service_odometer != null
                        ? `${Number(record.next_service_odometer).toLocaleString()} km`
                        : '—'}
                    </td>
                    <td>{Number(record.odometer_at_maintenance || 0).toLocaleString()} km</td>
                    <td>${Number(record.cost_usd || 0).toLocaleString()}</td>
                    <td>
                      <span className={
                        record.work_status === 'WORK_COMPLETED' || record.completed_date
                          ? 'status-badge active'
                          : 'status-badge maintenance'
                      }>
                        {workStatusLabel(record.work_status) || (record.completed_date ? 'Work Completed' : 'Work in Progress')}
                      </span>
                    </td>
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

export default Maintenance;
