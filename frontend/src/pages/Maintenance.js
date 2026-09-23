import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  History,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Download,
  Wrench,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import HorizontalScrollContainer from '../components/HorizontalScrollContainer';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';
import { workStatusLabel } from '../utils/workStatus';
import { useRecordHighlight } from '../utils/recordHighlight';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const toDateInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.split('T')[0];
  try {
    return new Date(value).toISOString().split('T')[0];
  } catch {
    return '';
  }
};

const formatDate = (value) => {
  const d = toDateInput(value);
  return d || '—';
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

const formatKm = (value) => {
  if (value == null || value === '' || Number.isNaN(Number(value))) return '—';
  return `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} km`;
};

const deviceLabel = (vehicle) => {
  if (!vehicle) return 'Unknown device';
  const reg = vehicle.registration_number || '';
  const make = vehicle.make || 'Vehicle';
  return `${make}_${reg}(${reg})`;
};

const recordSortKey = (record) => {
  const raw = record.completed_date || record.scheduled_date || record.created_at || 0;
  const t = new Date(raw).getTime();
  return Number.isNaN(t) ? 0 : t;
};

const SCHEDULED_ALERT_LEAD_DAYS = 30;
const MAINTENANCE_ODO_LEAD_KM = 1000;

const isDueAttention = (vehicle, latest) => {
  if (!latest) return false;
  const now = Date.now();
  if (latest.next_due_date) {
    const due = new Date(latest.next_due_date).getTime();
    if (!Number.isNaN(due) && due <= now + SCHEDULED_ALERT_LEAD_DAYS * 24 * 60 * 60 * 1000) {
      return true;
    }
  }
  if (latest.next_service_odometer != null && vehicle?.odometer_reading != null) {
    const remaining = Number(latest.next_service_odometer) - Number(vehicle.odometer_reading);
    if (!Number.isNaN(remaining) && remaining <= MAINTENANCE_ODO_LEAD_KM) {
      return true;
    }
  }
  return false;
};

const createFormForVehicle = (vehicle, intervalDefaults) => {
  const odo = vehicle?.odometer_reading ?? 0;
  const today = new Date().toISOString().split('T')[0];
  const km = intervalDefaults?.interval_km ?? 7000;
  const months = intervalDefaults?.interval_months ?? 3;
  const nextDate = (() => {
    const d = new Date(today);
    d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  })();
  return {
    vehicle_id: vehicle?.id || '',
    maintenance_type: 'ROUTINE',
    description: 'DUE FOR SERVICING',
    scheduled_date: today,
    next_due_date: nextDate,
    next_service_odometer: String(Number(odo) + km),
    odometer_at_maintenance: odo,
    cost: 0,
    currency: 'GHS',
    notes: '',
    work_status: 'WORK_COMPLETED',
  };
};

const Maintenance = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'maintenance_record');
  const [searchParams] = useSearchParams();
  const workStatusFilter = searchParams.get('work_status') || '';
  const highlightVehicleId = searchParams.get('vehicle_id') || '';

  const [records, setRecords] = useState([]);
  const [requests, setRequests] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [intervalDefaults, setIntervalDefaults] = useState({ interval_months: 3, interval_km: 7000 });

  const [addOpen, setAddOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState(null);
  const [formData, setFormData] = useState(() => createFormForVehicle(null, { interval_months: 3, interval_km: 7000 }));
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [predictOpen, setPredictOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [predicting, setPredicting] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const { rowHighlightProps } = useRecordHighlight('maintenance');

  const fetchData = useCallback(async () => {
    try {
      const [recordsRes, vehiclesRes, defaultsRes, requestsRes] = await Promise.all([
        axios.get(`${API}/maintenance`),
        axios.get(`${API}/vehicles`),
        axios.get(`${API}/settings/maintenance-defaults`).catch(() => ({
          data: { interval_months: 3, interval_km: 7000 },
        })),
        axios.get(`${API}/maintenance-requests`).catch(() => ({ data: [] })),
      ]);
      setRecords(recordsRes.data || []);
      setVehicles(vehiclesRes.data || []);
      setIntervalDefaults(defaultsRes.data || { interval_months: 3, interval_km: 7000 });
      setRequests(requestsRes.data || []);
    } catch {
      toast.error('Failed to load maintenance data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  const recordsByVehicle = useMemo(() => {
    const map = new Map();
    records.forEach((r) => {
      const list = map.get(r.vehicle_id) || [];
      list.push(r);
      map.set(r.vehicle_id, list);
    });
    map.forEach((list, key) => {
      map.set(
        key,
        [...list].sort((a, b) => recordSortKey(b) - recordSortKey(a))
      );
    });
    return map;
  }, [records]);

  const requestsByVehicle = useMemo(() => {
    const map = new Map();
    requests.forEach((r) => {
      const list = map.get(r.vehicle_id) || [];
      list.push(r);
      map.set(r.vehicle_id, list);
    });
    map.forEach((list, key) => {
      map.set(
        key,
        [...list].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      );
    });
    return map;
  }, [requests]);

  const vehicleRows = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return vehicles
      .map((vehicle) => {
        const history = recordsByVehicle.get(vehicle.id) || [];
        const latest = history[0] || null;
        return {
          vehicle,
          latest,
          history,
          requests: requestsByVehicle.get(vehicle.id) || [],
          needsAttention: isDueAttention(vehicle, latest),
          lastUpdate: latest?.created_at || latest?.scheduled_date || vehicle.updated_at,
        };
      })
      .filter((row) => {
        if (workStatusFilter === 'incomplete') {
          return (row.history || []).some(
            (r) => r.work_status !== 'WORK_COMPLETED' && !r.completed_date
          );
        }
        if (highlightVehicleId && row.vehicle.id === highlightVehicleId) return true;
        if (!q) return true;
        const label = deviceLabel(row.vehicle).toLowerCase();
        return (
          label.includes(q) ||
          (row.vehicle.registration_number || '').toLowerCase().includes(q) ||
          (row.vehicle.make || '').toLowerCase().includes(q) ||
          (row.vehicle.model || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.needsAttention !== b.needsAttention) return a.needsAttention ? -1 : 1;
        return (a.vehicle.registration_number || '').localeCompare(
          b.vehicle.registration_number || ''
        );
      });
  }, [
    vehicles,
    recordsByVehicle,
    requestsByVehicle,
    searchTerm,
    workStatusFilter,
    highlightVehicleId,
  ]);

  const openAddForVehicle = (vehicle) => {
    setActiveVehicle(vehicle);
    setFormData(createFormForVehicle(vehicle, intervalDefaults));
    setAddOpen(true);
  };

  const openHistoryForVehicle = (vehicle) => {
    setActiveVehicle(vehicle);
    setHistoryOpen(true);
  };

  const handleAddOpenChange = (open) => {
    setAddOpen(open);
    if (!open) setActiveVehicle(null);
  };

  const handleHistoryOpenChange = (open) => {
    setHistoryOpen(open);
    if (!open) setActiveVehicle(null);
  };

  const handleCurrentOdoChange = (value) => {
    const km = intervalDefaults.interval_km ?? 7000;
    setFormData((prev) => {
      const odo = parseFloat(value);
      if (Number.isNaN(odo)) {
        return { ...prev, odometer_at_maintenance: value };
      }
      const prevOdo = parseFloat(prev.odometer_at_maintenance);
      const prevNext = parseFloat(prev.next_service_odometer);
      const wasAuto =
        !Number.isNaN(prevOdo) &&
        !Number.isNaN(prevNext) &&
        prevNext === prevOdo + km;
      return {
        ...prev,
        odometer_at_maintenance: value,
        next_service_odometer:
          wasAuto || prev.next_service_odometer === '' || prev.next_service_odometer == null
            ? String(odo + km)
            : prev.next_service_odometer,
      };
    });
  };

  const handleCurrentDateChange = (value) => {
    const months = intervalDefaults.interval_months ?? 3;
    setFormData((prev) => {
      let nextDue = prev.next_due_date;
      if (prev.scheduled_date && prev.next_due_date) {
        const expected = new Date(prev.scheduled_date);
        expected.setMonth(expected.getMonth() + months);
        if (toDateInput(prev.next_due_date) === toDateInput(expected)) {
          const d = new Date(value);
          d.setMonth(d.getMonth() + months);
          nextDue = d.toISOString().split('T')[0];
        }
      } else if (!prev.next_due_date) {
        const d = new Date(value);
        d.setMonth(d.getMonth() + months);
        nextDue = d.toISOString().split('T')[0];
      }
      return { ...prev, scheduled_date: value, next_due_date: nextDue };
    });
  };

  const handleSubmitAdd = async (e) => {
    e.preventDefault();
    const payload = {
      vehicle_id: formData.vehicle_id,
      maintenance_type: formData.maintenance_type || 'ROUTINE',
      description: formData.description || 'DUE FOR SERVICING',
      scheduled_date: new Date(formData.scheduled_date).toISOString(),
      next_due_date: formData.next_due_date
        ? new Date(formData.next_due_date).toISOString()
        : null,
      next_service_odometer:
        formData.next_service_odometer !== '' && formData.next_service_odometer != null
          ? parseFloat(formData.next_service_odometer)
          : null,
      odometer_at_maintenance: parseFloat(formData.odometer_at_maintenance) || 0,
      cost: parseFloat(formData.cost) || 0,
      currency: formData.currency || 'GHS',
      notes: formData.notes || null,
      work_status: formData.work_status || 'WORK_COMPLETED',
    };

    try {
      await axios.post(`${API}/maintenance`, payload);
      toast.success('Maintenance record added');
      handleAddOpenChange(false);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to add maintenance record');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/maintenance/${deleteTarget.id}`);
      toast.success('Maintenance record deleted');
      setDeleteTarget(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
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

  const downloadBulkTemplate = async () => {
    try {
      const response = await axios.get(`${API}/maintenance/bulk-upload/template`, {
        responseType: 'blob',
      });
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

  const activeHistory = activeVehicle
    ? recordsByVehicle.get(activeVehicle.id) || []
    : [];
  const activeRequests = activeVehicle
    ? requestsByVehicle.get(activeVehicle.id) || []
    : [];

  if (loading) {
    return <div className="p-8 text-center">Loading maintenance records...</div>;
  }

  return (
    <div className="p-6 lg:p-8" data-testid="maintenance-page">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Maintenance Records</h1>
          <p className="text-slate-600 mt-1">
            Per-vehicle servicing summary, history, and next due dates
          </p>
          {workStatusFilter === 'incomplete' && (
            <p className="text-sm text-amber-700 mt-1">
              Showing vehicles with incomplete maintenance work
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Dialog open={predictOpen} onOpenChange={setPredictOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="ai-predict-btn">
                <Sparkles size={18} className="mr-2" />
                AI Predict
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>AI Maintenance Prediction</DialogTitle>
                <DialogDescription>
                  Select a vehicle to analyze its maintenance needs.
                </DialogDescription>
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
                          {v.registration_number} — {v.make} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={predictMaintenance} disabled={predicting} className="w-full">
                  {predicting ? 'Analyzing…' : 'Predict Maintenance Needs'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          {canEdit && (
            <>
              <Button
                variant="outline"
                data-testid="bulk-upload-maintenance-btn"
                onClick={() => setBulkDialogOpen(true)}
              >
                <Upload size={18} className="mr-2" />
                Bulk Upload
              </Button>
              <Dialog
                open={bulkDialogOpen}
                onOpenChange={(open) => {
                  setBulkDialogOpen(open);
                  if (!open) {
                    setBulkFile(null);
                    setBulkResult(null);
                  }
                }}
              >
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Bulk Upload Maintenance</DialogTitle>
                    <DialogDescription>
                      Import records from Excel. Match vehicles by registration number.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleBulkUpload} className="space-y-4">
                    <Button type="button" variant="outline" className="w-full" onClick={downloadBulkTemplate}>
                      <Download size={16} className="mr-2" />
                      Download sample template (.xlsx)
                    </Button>
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
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
                        <p className="font-medium">
                          Imported {bulkResult.created} · Failed {bulkResult.failed}
                        </p>
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => setBulkDialogOpen(false)}>
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

      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
          <Input
            className="pl-10"
            placeholder="Search by device, registration, make…"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            data-testid="maintenance-search"
          />
        </div>
        <p className="text-sm text-slate-500 self-center">
          Interval defaults: every {intervalDefaults.interval_months ?? 3} months /{' '}
          {(intervalDefaults.interval_km ?? 7000).toLocaleString()} km
        </p>
      </div>

      <div className="fleet-card table-container !p-0 overflow-hidden">
        <HorizontalScrollContainer>
          <table className="maint-device-table min-w-full" data-testid="maintenance-device-table">
            <thead>
              <tr>
                <th>Device</th>
                <th>Odometer</th>
                <th>
                  Last Maintenance Mileage
                  <br />
                  <span className="font-normal text-slate-500">/ Last Maintenance Time</span>
                </th>
                <th>
                  Next Maintenance Mileage
                  <br />
                  <span className="font-normal text-slate-500">/ Next Maintenance Date</span>
                </th>
                <th>Last Update</th>
                <th>Status</th>
                <th className="text-center">Operation</th>
              </tr>
            </thead>
            <tbody>
              {vehicleRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    No vehicles found. Add vehicles to manage maintenance history.
                  </td>
                </tr>
              ) : (
                vehicleRows.map(({ vehicle, latest, needsAttention, lastUpdate, history }) => (
                  <tr
                    key={vehicle.id}
                    data-testid={`maint-device-row-${vehicle.id}`}
                    {...(latest ? rowHighlightProps(latest.id) : {})}
                    className={needsAttention ? 'maint-device-row--attention' : undefined}
                  >
                    <td className="font-medium text-slate-800 whitespace-nowrap">
                      {deviceLabel(vehicle)}
                    </td>
                    <td className="whitespace-nowrap">{formatKm(vehicle.odometer_reading)}</td>
                    <td>
                      {latest ? (
                        <div className="leading-snug">
                          <div>{formatKm(latest.odometer_at_maintenance)}</div>
                          <div className="text-slate-500 text-xs">
                            {formatDate(latest.completed_date || latest.scheduled_date)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td>
                      {latest && (latest.next_service_odometer != null || latest.next_due_date) ? (
                        <div className="leading-snug">
                          <div>{formatKm(latest.next_service_odometer)}</div>
                          <div className="text-slate-500 text-xs">
                            {formatDate(latest.next_due_date)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="text-sm text-slate-600 whitespace-nowrap">
                      {formatDateTime(lastUpdate)}
                    </td>
                    <td className="text-center">
                      {needsAttention ? (
                        <span title="Service due or overdue" className="inline-flex text-amber-500">
                          <AlertTriangle size={18} />
                        </span>
                      ) : (
                        <span className="text-slate-400">--</span>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center justify-center gap-1">
                        {canEdit && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-amber-700"
                            title="Add New Record"
                            data-testid={`maint-add-${vehicle.id}`}
                            onClick={() => openAddForVehicle(vehicle)}
                          >
                            <Wrench size={16} />
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-slate-500 hover:text-slate-800"
                          title="View All Records"
                          data-testid={`maint-history-${vehicle.id}`}
                          onClick={() => openHistoryForVehicle(vehicle)}
                        >
                          <History size={16} />
                        </Button>
                        {canDelete && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-slate-500 hover:text-red-600"
                            title={
                              history[0]
                                ? 'Delete latest maintenance record'
                                : 'No record to delete'
                            }
                            disabled={!history[0]}
                            data-testid={`maint-delete-${vehicle.id}`}
                            onClick={() => history[0] && setDeleteTarget(history[0])}
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </HorizontalScrollContainer>
      </div>

      {/* Add Maintenance Record — GTI Holding theme */}
      <Dialog open={addOpen} onOpenChange={handleAddOpenChange}>
        <DialogContent className="maint-form-dialog max-w-md p-0 overflow-hidden gap-0 [&>button.absolute]:hidden sm:rounded-xl">
          <div className="maint-form-header flex items-center justify-between px-5 py-3.5">
            <div className="flex items-center gap-2.5 text-white">
              <span
                className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                style={{ backgroundColor: 'rgba(227, 170, 39, 0.25)', color: '#e3aa27' }}
              >
                <Wrench size={16} />
              </span>
              <DialogTitle className="text-white text-base font-semibold tracking-tight">
                Add Maintenance Record
              </DialogTitle>
            </div>
            <button
              type="button"
              className="text-white/70 hover:text-[#e3aa27] transition-colors"
              onClick={() => handleAddOpenChange(false)}
              aria-label="Close"
            >
              <X size={18} />
            </button>
          </div>
          <form onSubmit={handleSubmitAdd} className="maint-form-body px-5 py-4 space-y-3.5">
            <div className="maint-form-row">
              <Label className="maint-form-label">Item</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="DUE FOR SERVICING"
                required
              />
            </div>
            <div className="maint-form-row">
              <Label className="maint-form-label">Device</Label>
              <Input value={deviceLabel(activeVehicle)} readOnly />
            </div>
            <div className="maint-form-row">
              <Label className="maint-form-label">Odometer</Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  value={activeVehicle?.odometer_reading ?? ''}
                  readOnly
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-700/70">
                  km
                </span>
              </div>
            </div>
            <div className="maint-form-row">
              <Label className="maint-form-label">
                Current Maintenance <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  value={formData.odometer_at_maintenance}
                  onChange={(e) => handleCurrentOdoChange(e.target.value)}
                  required
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-700/70">
                  km
                </span>
              </div>
            </div>
            <div className="maint-form-row">
              <Label className="maint-form-label">
                Current date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={formData.scheduled_date}
                onChange={(e) => handleCurrentDateChange(e.target.value)}
                required
              />
            </div>
            <div className="maint-form-row">
              <Label className="maint-form-label">
                Next Maintenance Mileage <span className="text-red-500">*</span>
              </Label>
              <div className="relative">
                <Input
                  type="number"
                  step="0.01"
                  value={formData.next_service_odometer}
                  onChange={(e) =>
                    setFormData({ ...formData, next_service_odometer: e.target.value })
                  }
                  required
                  className="pr-12"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-700/70">
                  km
                </span>
              </div>
            </div>
            <div className="maint-form-row">
              <Label className="maint-form-label">
                Next Maintenance Date <span className="text-red-500">*</span>
              </Label>
              <Input
                type="date"
                value={formData.next_due_date}
                onChange={(e) => setFormData({ ...formData, next_due_date: e.target.value })}
                required
              />
            </div>
            <div className="maint-form-row">
              <Label className="maint-form-label">Remark</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
              />
            </div>
            <div className="flex justify-center gap-3 pt-2 pb-1">
              <Button type="submit" className="maint-form-submit">
                Submit
              </Button>
              <Button
                type="button"
                variant="outline"
                className="maint-form-cancel"
                onClick={() => handleAddOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* View All Records — history + requests for vehicle */}
      <Dialog open={historyOpen} onOpenChange={handleHistoryOpenChange}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle>Maintenance History</DialogTitle>
            <DialogDescription>
              {activeVehicle
                ? `${deviceLabel(activeVehicle)} — servicing records and requests`
                : 'Vehicle history'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 min-h-0 overflow-y-auto space-y-5 pr-1">
            <section>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-800">
                  Servicing records ({activeHistory.length})
                </h3>
                {canEdit && activeVehicle && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setHistoryOpen(false);
                      openAddForVehicle(activeVehicle);
                    }}
                  >
                    <Wrench size={14} className="mr-1.5" />
                    Add record
                  </Button>
                )}
              </div>
              {activeHistory.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  No servicing records yet for this vehicle.
                </p>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-600">
                      <tr>
                        <th className="text-left px-3 py-2 font-medium">Item</th>
                        <th className="text-left px-3 py-2 font-medium">Mileage</th>
                        <th className="text-left px-3 py-2 font-medium">Date</th>
                        <th className="text-left px-3 py-2 font-medium">Next</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        {canDelete && <th className="w-12" />}
                      </tr>
                    </thead>
                    <tbody>
                      {activeHistory.map((rec) => (
                        <tr key={rec.id} className="border-t border-slate-100">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-800">{rec.description}</div>
                            <div className="text-xs text-slate-500">
                              {rec.maintenance_type}
                              {rec.notes ? ` · ${rec.notes}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {formatKm(rec.odometer_at_maintenance)}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {formatDate(rec.completed_date || rec.scheduled_date)}
                          </td>
                          <td className="px-3 py-2.5">
                            <div>{formatKm(rec.next_service_odometer)}</div>
                            <div className="text-xs text-slate-500">
                              {formatDate(rec.next_due_date)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {workStatusLabel(rec.work_status)}
                          </td>
                          {canDelete && (
                            <td className="px-2 py-2.5">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-slate-400 hover:text-red-600"
                                title="Delete record"
                                onClick={() => setDeleteTarget(rec)}
                              >
                                <Trash2 size={14} />
                              </Button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-slate-800 mb-2">
                Maintenance requests ({activeRequests.length})
              </h3>
              {activeRequests.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-lg">
                  No maintenance requests submitted for this vehicle.
                </p>
              ) : (
                <ul className="space-y-2">
                  {activeRequests.map((req) => (
                    <li
                      key={req.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 truncate">{req.request_type}</p>
                          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                            {req.description}
                          </p>
                          <p className="text-xs text-slate-400 mt-1">
                            {formatDateTime(req.created_at)}
                            {req.priority ? ` · ${req.priority}` : ''}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
                            req.status === 'APPROVED'
                              ? 'bg-green-100 text-green-700'
                              : req.status === 'REJECTED'
                                ? 'bg-red-100 text-red-700'
                                : req.status === 'COMPLETED'
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-amber-100 text-amber-700'
                          }`}
                        >
                          {req.status}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete maintenance record?"
        description={
          deleteTarget
            ? `Delete “${deleteTarget.description}” for ${
                vehicles.find((v) => v.id === deleteTarget.vehicle_id)?.registration_number ||
                'this vehicle'
              }? This cannot be undone.`
            : ''
        }
        onConfirm={handleDelete}
        loading={deleting}
      />
    </div>
  );
};

export default Maintenance;
