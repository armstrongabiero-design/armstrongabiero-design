import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  AlertTriangle,
  History,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Download,
  Wrench,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import RecordFilters, { SortHeader } from '../components/RecordFilters';
import MaintenanceRecordDialog, { CURRENCIES, MAINTENANCE_TYPES } from '../components/maintenance/MaintenanceRecordDialog';
import { WORK_STATUS_OPTIONS } from '../utils/workStatus';
import { ALL, distinctOptions, matchesText, sameValue, useFilters, useSort } from '../utils/filtering';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import HorizontalScrollContainer from '../components/HorizontalScrollContainer';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';
import { workStatusLabel } from '../utils/workStatus';
import { useRecordHighlight } from '../utils/recordHighlight';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/** Calendar YYYY-MM-DD from a date-only string or Date (local calendar, no TZ shift). */
const toDateInput = (value) => {
  if (!value) return '';
  if (typeof value === 'string') {
    const m = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
  }
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  } catch {
    return '';
  }
};

/** Prefer the user-entered service date over completed_date (legacy rows used "now"). */
const serviceDateOf = (record) =>
  record?.scheduled_date || record?.completed_date || record?.created_at || null;

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

/** Newest service first; on the same day, the record entered last wins. */
const compareRecords = (a, b) => {
  const day = (r) => toDateInput(serviceDateOf(r));
  const byDay = day(b).localeCompare(day(a));
  if (byDay) return byDay;
  return String(b.created_at || '').localeCompare(String(a.created_at || ''));
};

const formatMoney = (amount, currency) => {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  return `${currency || ''} ${Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`.trim();
};

const typeLabel = (value) => MAINTENANCE_TYPES.find((t) => t.value === value)?.label || value || '—';

const STATUS_FILTER_OPTIONS = [
  { value: 'INCOMPLETE', label: 'Not completed (any)' },
  ...WORK_STATUS_OPTIONS,
];

const INITIAL_RECORD_FILTERS = {
  vehicle: ALL,
  maintenance_type: ALL,
  work_status: ALL,
  provider: ALL,
  currency: ALL,
  date_from: '',
  date_to: '',
  cost_min: '',
  cost_max: '',
};

const RECORD_SORT = {
  date: (r) => toDateInput(serviceDateOf(r)),
  registration: (r) => r._registration,
  item: (r) => r.description,
  type: (r) => r.maintenance_type,
  provider: (r) => r.service_provider,
  cost: (r) => Number(r.cost ?? 0),
  status: (r) => r.work_status,
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

  const [vendors, setVendors] = useState([]);
  const [workshops, setWorkshops] = useState([]);
  const [tab, setTab] = useState(searchParams.get('view') === 'records' ? 'records' : 'vehicles');
  // { key, record?, vehicle? } — a new key remounts the form so it never keeps old values.
  const [editor, setEditor] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [activeVehicle, setActiveVehicle] = useState(null);
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
      const [recordsRes, vehiclesRes, defaultsRes, requestsRes, vendorsRes, workshopsRes] = await Promise.all([
        axios.get(`${API}/maintenance`),
        axios.get(`${API}/vehicles`),
        axios.get(`${API}/settings/maintenance-defaults`).catch(() => ({
          data: { interval_months: 3, interval_km: 7000 },
        })),
        axios.get(`${API}/maintenance-requests`).catch(() => ({ data: [] })),
        axios.get(`${API}/vendors`).catch(() => ({ data: [] })),
        axios.get(`${API}/master/workshops`).catch(() => ({ data: [] })),
      ]);
      setRecords(recordsRes.data || []);
      setVehicles(vehiclesRes.data || []);
      setIntervalDefaults(defaultsRes.data || { interval_months: 3, interval_km: 7000 });
      setRequests(requestsRes.data || []);
      setVendors(vendorsRes.data || []);
      setWorkshops(workshopsRes.data || []);
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
        [...list].sort(compareRecords)
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

  const vehiclesById = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  // ---- All records tab
  const [recordSearch, setRecordSearch] = useState('');
  const {
    filters: recordFilters,
    setFilter: setRecordFilter,
    clear: clearRecordFilters,
    activeCount: recordFilterCount,
  } = useFilters(INITIAL_RECORD_FILTERS);

  const recordRows = useMemo(
    () => records.map((r) => ({ ...r, _registration: vehiclesById.get(r.vehicle_id)?.registration_number || '' })),
    [records, vehiclesById]
  );

  const recordOptions = useMemo(() => ({
    vehicle: distinctOptions(recordRows, (r) => r._registration),
    provider: distinctOptions(recordRows, (r) => r.service_provider),
    currency: CURRENCIES.filter((c) => records.some((r) => r.currency === c)).map((c) => ({ value: c, label: c })),
  }), [recordRows, records]);

  const filteredRecords = useMemo(() => {
    const f = recordFilters;
    const min = f.cost_min === '' ? null : Number(f.cost_min);
    const max = f.cost_max === '' ? null : Number(f.cost_max);
    return recordRows.filter((r) => {
      const vehicle = vehiclesById.get(r.vehicle_id);
      if (!matchesText(recordSearch, r.description, r.notes, r.service_provider, r._registration, vehicle?.make, vehicle?.model)) {
        return false;
      }
      const day = toDateInput(serviceDateOf(r));
      const incomplete = r.work_status !== 'WORK_COMPLETED';
      return (
        sameValue(f.vehicle, r._registration) &&
        sameValue(f.maintenance_type, r.maintenance_type) &&
        (f.work_status === ALL || (f.work_status === 'INCOMPLETE' ? incomplete : r.work_status === f.work_status)) &&
        sameValue(f.provider, r.service_provider) &&
        sameValue(f.currency, r.currency) &&
        (!f.date_from || day >= f.date_from) &&
        (!f.date_to || day <= f.date_to) &&
        (min == null || Number(r.cost ?? 0) >= min) &&
        (max == null || Number(r.cost ?? 0) <= max)
      );
    });
  }, [recordRows, recordFilters, recordSearch, vehiclesById]);

  const { sorted: visibleRecords, sort: recordSort, toggle: toggleRecordSort } = useSort(filteredRecords, RECORD_SORT, 'date', 'desc');

  const clearAllRecordFilters = () => {
    clearRecordFilters();
    setRecordSearch('');
  };

  const filteredCostTotals = useMemo(() => {
    const totals = {};
    filteredRecords.forEach((r) => {
      totals[r.currency || '—'] = (totals[r.currency || '—'] || 0) + Number(r.cost || 0);
    });
    return Object.entries(totals);
  }, [filteredRecords]);

  const openAddForVehicle = (vehicle) => {
    setEditor({ key: Date.now(), vehicle });
  };

  const openEditRecord = (rec) => {
    setEditor({ key: Date.now(), record: rec });
  };

  const handleSaved = (saved) => {
    const wasEdit = Boolean(editor?.record);
    const vehicleRecords = recordsByVehicle.get(saved.vehicle_id) || [];
    const latest = vehicleRecords[0];
    const olderThanLatest =
      !wasEdit && latest && toDateInput(saved.scheduled_date) < toDateInput(serviceDateOf(latest));
    if (olderThanLatest) {
      toast.success('Record saved', {
        description: 'It is dated before this vehicle’s latest service, so it shows in the vehicle’s history and under All records, not in the summary row.',
      });
    } else {
      toast.success(wasEdit ? 'Record updated' : 'Maintenance record added');
    }
    fetchData();
  };

  const openHistoryForVehicle = (vehicle) => {
    setActiveVehicle(vehicle);
    setHistoryOpen(true);
  };

  const handleHistoryOpenChange = (open) => {
    setHistoryOpen(open);
    if (!open) setActiveVehicle(null);
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
                        {bulkResult.errors?.length > 0 && (
                          <ul className="max-h-32 overflow-y-auto text-red-700 space-y-1 mt-2">
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

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <TabsList>
            <TabsTrigger value="vehicles" data-testid="maint-tab-vehicles">By vehicle</TabsTrigger>
            <TabsTrigger value="records" data-testid="maint-tab-records">All records ({records.length})</TabsTrigger>
          </TabsList>
          {canEdit && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setEditor({ key: Date.now(), vehicle: null })}
              data-testid="maint-add-record"
            >
              <Wrench size={15} className="mr-1.5" />
              Add record
            </Button>
          )}
        </div>

        <TabsContent value="vehicles">
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
                            {formatDate(serviceDateOf(latest))}
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

        </TabsContent>

        <TabsContent value="records">
          <RecordFilters
            testId="maintenance-filters"
            search={recordSearch}
            onSearch={setRecordSearch}
            searchPlaceholder="Search item, remark, provider, registration, make or model"
            noun="records"
            shown={visibleRecords.length}
            total={records.length}
            activeCount={recordFilterCount}
            onClear={clearAllRecordFilters}
            filters={[
              { key: 'vehicle', label: 'Registration', allLabel: 'All vehicles', value: recordFilters.vehicle, onChange: (v) => setRecordFilter('vehicle', v), options: recordOptions.vehicle },
              { key: 'maintenance_type', label: 'Type', allLabel: 'All types', value: recordFilters.maintenance_type, onChange: (v) => setRecordFilter('maintenance_type', v), options: MAINTENANCE_TYPES },
              { key: 'work_status', label: 'Status', allLabel: 'All statuses', value: recordFilters.work_status, onChange: (v) => setRecordFilter('work_status', v), options: STATUS_FILTER_OPTIONS },
              { key: 'provider', label: 'Service provider', allLabel: 'All providers', value: recordFilters.provider, onChange: (v) => setRecordFilter('provider', v), options: recordOptions.provider },
              { key: 'currency', label: 'Currency', allLabel: 'All currencies', value: recordFilters.currency, onChange: (v) => setRecordFilter('currency', v), options: recordOptions.currency },
            ]}
          >
            <div className="grid grid-cols-2 md:flex gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1" htmlFor="maint-date-from">From</label>
                <Input id="maint-date-from" type="date" className="h-9" value={recordFilters.date_from}
                  max={recordFilters.date_to || undefined}
                  onChange={(e) => setRecordFilter('date_from', e.target.value)} data-testid="maint-filter-date-from" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1" htmlFor="maint-date-to">To</label>
                <Input id="maint-date-to" type="date" className="h-9" value={recordFilters.date_to}
                  min={recordFilters.date_from || undefined}
                  onChange={(e) => setRecordFilter('date_to', e.target.value)} data-testid="maint-filter-date-to" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1" htmlFor="maint-cost-min">Cost from</label>
                <Input id="maint-cost-min" type="number" min="0" className="h-9 md:w-28" value={recordFilters.cost_min}
                  onChange={(e) => setRecordFilter('cost_min', e.target.value)} placeholder="Min" data-testid="maint-filter-cost-min" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1" htmlFor="maint-cost-max">Cost to</label>
                <Input id="maint-cost-max" type="number" min="0" className="h-9 md:w-28" value={recordFilters.cost_max}
                  onChange={(e) => setRecordFilter('cost_max', e.target.value)} placeholder="Max" data-testid="maint-filter-cost-max" />
              </div>
            </div>
          </RecordFilters>

          {filteredCostTotals.length > 0 && (
            <p className="text-sm text-slate-600 mb-2" data-testid="maint-filter-total">
              Total cost of these records:{' '}
              {filteredCostTotals.map(([currency, amount]) => formatMoney(amount, currency)).join(' · ')}
            </p>
          )}

          <div className="fleet-card table-container !p-0 overflow-hidden">
            <HorizontalScrollContainer>
              <table className="maint-device-table min-w-full" data-testid="maintenance-records-table">
                <thead>
                  <tr>
                    <SortHeader label="Service date" sortKey="date" sort={recordSort} onSort={toggleRecordSort} />
                    <SortHeader label="Registration" sortKey="registration" sort={recordSort} onSort={toggleRecordSort} />
                    <SortHeader label="Item" sortKey="item" sort={recordSort} onSort={toggleRecordSort} />
                    <SortHeader label="Type" sortKey="type" sort={recordSort} onSort={toggleRecordSort} />
                    <SortHeader label="Provider" sortKey="provider" sort={recordSort} onSort={toggleRecordSort} />
                    <th>Odometer</th>
                    <th>Next service</th>
                    <SortHeader label="Cost" sortKey="cost" sort={recordSort} onSort={toggleRecordSort} />
                    <SortHeader label="Status" sortKey="status" sort={recordSort} onSort={toggleRecordSort} />
                    {(canEdit || canDelete) && <th className="text-center">Operation</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleRecords.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="text-center py-12 text-slate-500">
                        {records.length === 0 ? 'No maintenance records yet.' : 'No records match these filters.'}
                        {records.length > 0 && (
                          <Button variant="link" className="ml-1 h-auto p-0" onClick={clearAllRecordFilters}>
                            Clear filters
                          </Button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    visibleRecords.map((rec) => {
                      const vehicle = vehiclesById.get(rec.vehicle_id);
                      return (
                        <tr key={rec.id} data-testid={`maint-record-row-${rec.id}`} {...rowHighlightProps(rec.id)}>
                          <td className="whitespace-nowrap">{formatDate(serviceDateOf(rec))}</td>
                          <td className="whitespace-nowrap font-medium">
                            {rec._registration || <span className="text-red-600" title="This record's vehicle no longer exists">Unknown vehicle</span>}
                            {vehicle && <div className="text-xs text-slate-500 font-normal">{vehicle.make} {vehicle.model}</div>}
                          </td>
                          <td>
                            <div className="font-medium text-slate-800">{rec.description}</div>
                            {rec.notes && <div className="text-xs text-slate-500 line-clamp-1">{rec.notes}</div>}
                          </td>
                          <td className="text-xs whitespace-nowrap">{typeLabel(rec.maintenance_type)}</td>
                          <td className="text-sm">{rec.service_provider || <span className="text-slate-400">—</span>}</td>
                          <td className="whitespace-nowrap">{formatKm(rec.odometer_at_maintenance)}</td>
                          <td className="whitespace-nowrap">
                            <div>{formatKm(rec.next_service_odometer)}</div>
                            <div className="text-xs text-slate-500">{formatDate(rec.next_due_date)}</div>
                          </td>
                          <td className="whitespace-nowrap">{formatMoney(rec.cost, rec.currency)}</td>
                          <td className="text-xs">{workStatusLabel(rec.work_status)}</td>
                          {(canEdit || canDelete) && (
                            <td>
                              <div className="flex items-center justify-center gap-1">
                                {canEdit && (
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-amber-700"
                                    title="Edit record" onClick={() => openEditRecord(rec)} data-testid={`maint-edit-${rec.id}`}>
                                    <Pencil size={15} />
                                  </Button>
                                )}
                                {canDelete && (
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-slate-500 hover:text-red-600"
                                    title="Delete record" onClick={() => setDeleteTarget(rec)}>
                                    <Trash2 size={15} />
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
            </HorizontalScrollContainer>
          </div>
        </TabsContent>
      </Tabs>

      {editor && (
        <MaintenanceRecordDialog
          key={editor.key}
          open
          onOpenChange={(open) => !open && setEditor(null)}
          record={editor.record || null}
          vehicle={editor.vehicle || null}
          vehicles={vehicles}
          vendors={vendors}
          workshops={workshops}
          intervals={intervalDefaults}
          onSaved={handleSaved}
        />
      )}

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
                        <th className="text-left px-3 py-2 font-medium">Cost</th>
                        <th className="text-left px-3 py-2 font-medium">Status</th>
                        {(canEdit || canDelete) && <th className="w-20" />}
                      </tr>
                    </thead>
                    <tbody>
                      {activeHistory.map((rec) => (
                        <tr key={rec.id} className="border-t border-slate-100">
                          <td className="px-3 py-2.5">
                            <div className="font-medium text-slate-800">{rec.description}</div>
                            <div className="text-xs text-slate-500">
                              {typeLabel(rec.maintenance_type)}
                              {rec.notes ? ` · ${rec.notes}` : ''}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {formatKm(rec.odometer_at_maintenance)}
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap">
                            {formatDate(serviceDateOf(rec))}
                          </td>
                          <td className="px-3 py-2.5">
                            <div>{formatKm(rec.next_service_odometer)}</div>
                            <div className="text-xs text-slate-500">
                              {formatDate(rec.next_due_date)}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                            {formatMoney(rec.cost, rec.currency)}
                            {rec.service_provider && <div className="text-slate-500">{rec.service_provider}</div>}
                          </td>
                          <td className="px-3 py-2.5 text-xs">
                            {workStatusLabel(rec.work_status)}
                          </td>
                          {(canEdit || canDelete) && (
                            <td className="px-2 py-2.5 whitespace-nowrap">
                              {canEdit && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 text-slate-400 hover:text-amber-700"
                                  title="Edit record"
                                  onClick={() => {
                                    setHistoryOpen(false);
                                    openEditRecord(rec);
                                  }}
                                >
                                  <Pencil size={14} />
                                </Button>
                              )}
                              {canDelete && (
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
                              )}
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
