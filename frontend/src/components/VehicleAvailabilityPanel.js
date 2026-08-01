import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Label } from '../components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import CountrySelect, {
  getCountryBadgeClass,
  getCountryLabel,
  countryMatchesFilter,
} from '../components/CountrySelect';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active (available)' },
  { value: 'INACTIVE', label: 'Inactive' },
  { value: 'MAINTENANCE', label: 'Maintenance (unavailable)' },
];

const VehicleAvailabilityPanel = ({ canEdit, initialCountry = 'ALL' }) => {
  const [summary, setSummary] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [weekly, setWeekly] = useState([]);
  const [monthly, setMonthly] = useState([]);
  const [events, setEvents] = useState([]);
  const [countryFilter, setCountryFilter] = useState(initialCountry || 'ALL');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [form, setForm] = useState({ status: 'ACTIVE', reason: '', notes: '' });
  const [saving, setSaving] = useState(false);

  const reasonOptions = summary?.reasons || [];

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const country = countryFilter && countryFilter !== 'ALL' ? countryFilter : undefined;
    const params = country ? { country } : {};
    try {
      const [summaryRes, vehiclesRes, weeklyRes, monthlyRes, eventsRes] = await Promise.all([
        axios.get(`${API}/vehicles/availability/summary`, { params }),
        axios.get(`${API}/vehicles`, { params }),
        axios.get(`${API}/vehicles/availability/weekly`, { params: { ...params, weeks: 12 } }),
        axios.get(`${API}/vehicles/availability/monthly`, { params: { ...params, months: 12 } }),
        axios.get(`${API}/vehicles/availability/events`, { params: { ...params, limit: 50 } }),
      ]);
      setSummary(summaryRes.data);
      setVehicles(vehiclesRes.data || []);
      setWeekly(weeklyRes.data?.weeks || []);
      setMonthly(monthlyRes.data?.months || []);
      setEvents(eventsRes.data || []);
    } catch {
      toast.error('Failed to load availability data');
    } finally {
      setLoading(false);
    }
  }, [countryFilter]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (initialCountry) setCountryFilter(initialCountry);
  }, [initialCountry]);

  const openStatusDialog = (vehicle) => {
    setSelectedVehicle(vehicle);
    setForm({
      status: vehicle.status || 'ACTIVE',
      reason: vehicle.availability_reason || '',
      notes: vehicle.availability_notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!selectedVehicle) return;
    if ((form.status === 'INACTIVE' || form.status === 'MAINTENANCE') && !form.reason) {
      toast.error('Select a reason for inactive / maintenance status');
      return;
    }
    setSaving(true);
    try {
      await axios.put(`${API}/vehicles/${selectedVehicle.id}/availability`, {
        status: form.status,
        reason: form.status === 'ACTIVE' ? null : form.reason || null,
        notes: form.notes || null,
      });
      toast.success('Availability updated');
      setDialogOpen(false);
      fetchAll();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to update availability');
    } finally {
      setSaving(false);
    }
  };

  const vehicleMap = useMemo(() => {
    const map = {};
    vehicles.forEach((v) => { map[v.id] = v; });
    return map;
  }, [vehicles]);

  const filteredVehicles = useMemo(() => {
    if (countryFilter === 'ALL') return vehicles;
    return vehicles.filter((v) => countryMatchesFilter(v.country, countryFilter));
  }, [vehicles, countryFilter]);

  const chartWeekly = weekly.map((w) => ({
    ...w,
    pct: w.availability_pct == null ? null : w.availability_pct,
  }));
  const chartMonthly = monthly.map((m) => ({
    ...m,
    pct: m.availability_pct == null ? null : m.availability_pct,
  }));

  if (loading && !summary) {
    return <div className="p-8 text-center text-slate-500">Loading availability…</div>;
  }

  return (
    <div className="space-y-6" data-testid="vehicle-availability-panel">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Fleet Availability</h2>
          <p className="text-sm text-slate-600 mt-1">
            Available = Active only. Maintenance and Inactive count as unavailable.
          </p>
        </div>
        <CountrySelect
          value={countryFilter}
          onValueChange={setCountryFilter}
          includeAllOption
          allLabel="All Countries"
          className="w-full lg:w-56"
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Availability</p>
          <p className="text-3xl font-bold text-slate-800 mt-1">{summary?.availability_pct ?? 0}%</p>
          <p className="text-xs text-slate-500 mt-1">{summary?.available ?? 0} of {summary?.total ?? 0} available</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Active</p>
          <p className="text-3xl font-bold text-green-700 mt-1">{summary?.active ?? 0}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Inactive</p>
          <p className="text-3xl font-bold text-slate-700 mt-1">{summary?.inactive ?? 0}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Maintenance</p>
          <p className="text-3xl font-bold text-amber-700 mt-1">{summary?.maintenance ?? 0}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fleet-card">
          <h3 className="font-semibold text-slate-800 mb-3">Weekly availability (last 12 weeks)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartWeekly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} angle={-20} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                <Tooltip formatter={(v) => (v == null ? 'No snapshot' : `${v}%`)} />
                <Legend />
                <Line type="monotone" dataKey="pct" name="Availability %" stroke="#0f766e" strokeWidth={2} connectNulls={false} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-slate-500 mt-2">Calendar weeks Mon–Sun. Gaps mean no snapshot yet for that week.</p>
        </div>
        <div className="fleet-card">
          <h3 className="font-semibold text-slate-800 mb-3">Monthly availability (last 12 months)</h3>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartMonthly}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={50} />
                <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} width={40} />
                <Tooltip formatter={(v) => (v == null ? 'No snapshot' : `${v}%`)} />
                <Legend />
                <Line type="monotone" dataKey="pct" name="Availability %" stroke="#b45309" strokeWidth={2} connectNulls={false} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="fleet-card table-container">
        <h3 className="font-semibold text-slate-800 mb-3">Vehicles</h3>
        <table>
          <thead>
            <tr>
              <th>Registration</th>
              <th>Vehicle</th>
              <th>Country</th>
              <th>Status</th>
              <th>Reason</th>
              <th>Notes</th>
              {canEdit && <th className="w-28">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 7 : 6} className="text-center py-8 text-slate-500">No vehicles</td>
              </tr>
            ) : (
              filteredVehicles.map((v) => {
                const reasonLabel = reasonOptions.find((r) => r.value === v.availability_reason)?.label
                  || v.availability_reason
                  || '—';
                return (
                  <tr key={v.id}>
                    <td className="font-semibold">{v.registration_number}</td>
                    <td>{v.make} {v.model}</td>
                    <td>
                      <span className={getCountryBadgeClass(v.country)}>{getCountryLabel(v.country)}</span>
                    </td>
                    <td>
                      <span className={`status-badge ${
                        v.status === 'ACTIVE' ? 'active' : v.status === 'MAINTENANCE' ? 'maintenance' : 'inactive'
                      }`}>{v.status}</span>
                    </td>
                    <td className="text-sm">{v.status === 'ACTIVE' ? '—' : reasonLabel}</td>
                    <td className="text-sm max-w-xs truncate">{v.status === 'ACTIVE' ? '—' : (v.availability_notes || '—')}</td>
                    {canEdit && (
                      <td>
                        <Button variant="outline" size="sm" onClick={() => openStatusDialog(v)}>
                          Set status
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="fleet-card table-container">
        <h3 className="font-semibold text-slate-800 mb-3">Recent status changes</h3>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Vehicle</th>
              <th>From → To</th>
              <th>Reason</th>
              <th>By</th>
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-6 text-slate-500">No history yet</td>
              </tr>
            ) : (
              events.map((ev) => {
                const veh = vehicleMap[ev.vehicle_id];
                const reasonLabel = reasonOptions.find((r) => r.value === ev.reason)?.label || ev.reason || '—';
                return (
                  <tr key={ev.id}>
                    <td className="text-sm">{ev.created_at ? new Date(ev.created_at).toLocaleString() : '—'}</td>
                    <td className="font-semibold">{veh?.registration_number || ev.vehicle_id}</td>
                    <td className="text-sm">{ev.previous_status || '—'} → {ev.new_status}</td>
                    <td className="text-sm">{reasonLabel}</td>
                    <td className="text-sm">{ev.changed_by_email || '—'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update availability</DialogTitle>
            <DialogDescription>
              {selectedVehicle
                ? `${selectedVehicle.registration_number} — ${selectedVehicle.make} ${selectedVehicle.model}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status, reason: status === 'ACTIVE' ? '' : form.reason })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(form.status === 'INACTIVE' || form.status === 'MAINTENANCE') && (
              <div>
                <Label>Reason *</Label>
                <Select value={form.reason} onValueChange={(reason) => setForm({ ...form, reason })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {reasonOptions.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {(form.status === 'INACTIVE' || form.status === 'MAINTENANCE') && (
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Additional context…"
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default VehicleAvailabilityPanel;
