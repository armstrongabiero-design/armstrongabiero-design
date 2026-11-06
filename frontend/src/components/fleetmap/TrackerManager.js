import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { toast } from 'sonner';
import { RefreshCw, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { getCountryLabel } from '../CountrySelect';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const NONE = '__none__';

const statusOf = (t) => {
  if (t.missing_from_protrack) return { label: 'Removed from ProTrack', className: 'bg-slate-100 text-slate-600' };
  if (!t.vehicle_id) return { label: 'Not linked', className: 'bg-red-100 text-red-700' };
  if (!t.confirmed) {
    const how = t.link_source === 'auto_name' ? 'Matched by name' : 'Matched by plate';
    return { label: how, className: 'bg-amber-100 text-amber-800' };
  }
  return { label: 'Linked', className: 'bg-green-100 text-green-800' };
};

export default function TrackerManager({ open, onOpenChange, vehicles, onChanged }) {
  const [trackers, setTrackers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingImei, setSavingImei] = useState(null);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API}/trackers`);
      setTrackers(res.data);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not load trackers');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await axios.post(`${API}/trackers/sync`);
      toast.success(
        `Found ${res.data.trackers} tracker${res.data.trackers === 1 ? '' : 's'} in ProTrack` +
          (res.data.auto_linked ? `, ${res.data.auto_linked} matched by plate` : ''),
      );
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not reach ProTrack');
    } finally {
      setSyncing(false);
    }
  };

  const save = async (tracker, vehicleId) => {
    setSavingImei(tracker.imei);
    try {
      const res = await axios.put(`${API}/trackers/${tracker.imei}`, { vehicle_id: vehicleId });
      setTrackers((rows) => rows.map((r) => (r.imei === tracker.imei ? res.data : r)));
      toast.success(vehicleId ? `Linked to ${res.data.registration_number}` : 'Tracker unlinked');
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Could not save');
    } finally {
      setSavingImei(null);
    }
  };

  const linkedVehicleIds = useMemo(() => new Set(trackers.map((t) => t.vehicle_id).filter(Boolean)), [trackers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trackers;
    return trackers.filter((t) =>
      [t.imei, t.device_name, t.protrack_plate, t.registration_number].some((v) => (v || '').toLowerCase().includes(q)),
    );
  }, [trackers, search]);

  const counts = useMemo(
    () => ({
      linked: trackers.filter((t) => t.vehicle_id && t.confirmed).length,
      confirm: trackers.filter((t) => t.vehicle_id && !t.confirmed).length,
      unlinked: trackers.filter((t) => !t.vehicle_id && !t.missing_from_protrack).length,
    }),
    [trackers],
  );

  const sortedVehicles = useMemo(
    () => [...vehicles].sort((a, b) => (a.registration_number || '').localeCompare(b.registration_number || '')),
    [vehicles],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>GPS trackers</DialogTitle>
          <DialogDescription>
            Trackers come from ProTrack. Those whose plate number, or device name, contains a vehicle's registration
            are linked automatically; confirm each match once, or choose the right vehicle.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-2">
          <span className="status-badge bg-green-100 text-green-800">{counts.linked} linked</span>
          <span className="status-badge bg-amber-100 text-amber-800">{counts.confirm} to confirm</span>
          <span className="status-badge bg-red-100 text-red-700">{counts.unlinked} not linked</span>
          <div className="ml-auto flex gap-2">
            <Input
              placeholder="Search plate or IMEI"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Button variant="outline" onClick={sync} disabled={syncing}>
              <RefreshCw size={16} className={`mr-2 ${syncing ? 'animate-spin' : ''}`} />
              Sync from ProTrack
            </Button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-slate-500">
                <th className="py-2">Tracker</th>
                <th>Plate in ProTrack</th>
                <th className="w-64">Vehicle</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {loading && !trackers.length ? (
                <tr><td colSpan={5} className="py-8 text-center text-slate-500">Loading...</td></tr>
              ) : !visible.length ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500">
                    {trackers.length ? 'No trackers match your search.' : 'No trackers yet. Use "Sync from ProTrack".'}
                  </td>
                </tr>
              ) : (
                visible.map((t) => {
                  const status = statusOf(t);
                  const busy = savingImei === t.imei;
                  return (
                    <tr key={t.imei} className="border-t border-slate-100">
                      <td className="py-2">
                        <div className="font-medium">{t.device_name || t.device_type || 'Tracker'}</div>
                        <div className="font-mono text-xs text-slate-500">{t.imei}</div>
                      </td>
                      <td>{t.protrack_plate || <span className="text-slate-400">none</span>}</td>
                      <td>
                        <Select
                          value={t.vehicle_id || NONE}
                          disabled={busy}
                          onValueChange={(v) => save(t, v === NONE ? null : v)}
                        >
                          <SelectTrigger aria-label={`Vehicle for tracker ${t.imei}`}>
                            <SelectValue placeholder="Choose vehicle" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Not linked</SelectItem>
                            {t.vehicle_id && !vehicles.some((v) => v.id === t.vehicle_id) && (
                              <SelectItem value={t.vehicle_id}>{t.registration_number || t.vehicle_id}</SelectItem>
                            )}
                            {sortedVehicles.map((v) => (
                              <SelectItem
                                key={v.id}
                                value={v.id}
                                disabled={linkedVehicleIds.has(v.id) && v.id !== t.vehicle_id}
                              >
                                {v.registration_number} · {getCountryLabel(v.country) || v.country}
                                {linkedVehicleIds.has(v.id) && v.id !== t.vehicle_id ? ' (has a tracker)' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td>
                        <span className={`status-badge ${status.className}`}>{status.label}</span>
                      </td>
                      <td className="text-right">
                        {t.vehicle_id && !t.confirmed && (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => save(t, t.vehicle_id)}>
                            <Check size={14} className="mr-1" /> Confirm
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
