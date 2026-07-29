import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Trash2, Save, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Switch } from '../components/ui/switch';
import CountrySelect, { getCountryLabel } from '../components/CountrySelect';
import { Navigate } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DAY_LABELS = [
  { value: 0, label: 'Mon' },
  { value: 1, label: 'Tue' },
  { value: 2, label: 'Wed' },
  { value: 3, label: 'Thu' },
  { value: 4, label: 'Fri' },
  { value: 5, label: 'Sat' },
  { value: 6, label: 'Sun' },
];

const emptyCountry = () => ({
  country: 'GH',
  enabled: true,
  timezone: 'Africa/Accra',
  reminder_hour: 7,
  reminder_minute: 0,
  hourly_repeat_enabled: false,
  skip_non_working_days: true,
  working_days: [0, 1, 2, 3, 4],
});

const TZ_BY_COUNTRY = {
  GH: 'Africa/Accra',
  LR: 'Africa/Monrovia',
  ST: 'Africa/Sao_Tome',
};

const ReminderSettings = () => {
  const { user, token, isManager } = useAuth();
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!isManager?.()) return;
    (async () => {
      try {
        const { data } = await axios.get(`${API}/settings/driver-reminders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        setCountries(data.countries?.length ? data.countries : [emptyCountry()]);
      } catch {
        toast.error('Failed to load reminder settings');
        setCountries([emptyCountry()]);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, isManager]);

  if (!isManager?.()) {
    return <Navigate to="/" replace />;
  }

  const updateRow = (index, patch) => {
    setCountries((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const toggleWorkingDay = (index, day) => {
    const row = countries[index];
    const days = new Set(row.working_days || []);
    if (days.has(day)) days.delete(day);
    else days.add(day);
    updateRow(index, { working_days: Array.from(days).sort() });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await axios.put(
        `${API}/settings/driver-reminders`,
        { countries },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setCountries(data.countries || countries);
      toast.success('Reminder settings saved');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleRunNow = async () => {
    setRunning(true);
    try {
      const { data } = await axios.post(
        `${API}/reminders/run`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      toast.success(`Reminders run: ${data.reminders_sent || 0} sent`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to run reminders');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-600">Loading reminder settings…</div>;
  }

  return (
    <div className="p-6 lg:p-8" data-testid="reminder-settings-page">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-800 flex items-center gap-2">
            <Bell className="text-amber-600" />
            Driver Reminders
          </h1>
          <p className="text-slate-600 mt-2">
            Per-country schedule for Daily Logbook and Pre-Trip Checklist reminders (email + in-app).
            Reminders stop once both are completed for the assigned vehicle.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRunNow} disabled={running}>
            {running ? 'Running…' : 'Run now'}
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save size={16} className="mr-2" />
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      <div className="space-y-6">
        {countries.map((row, index) => (
          <div key={`${row.country}-${index}`} className="fleet-card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-[220px]">
                <CountrySelect
                  value={row.country}
                  onValueChange={(code) =>
                    updateRow(index, {
                      country: code,
                      timezone: TZ_BY_COUNTRY[code] || row.timezone || 'UTC',
                    })
                  }
                  className="w-56"
                />
                <span className="text-sm text-slate-500">{getCountryLabel(row.country)}</span>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor={`enabled-${index}`}>Enabled</Label>
                <Switch
                  id={`enabled-${index}`}
                  checked={!!row.enabled}
                  onCheckedChange={(v) => updateRow(index, { enabled: v })}
                />
                {countries.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setCountries((prev) => prev.filter((_, i) => i !== index))}
                    aria-label="Remove country"
                  >
                    <Trash2 size={16} className="text-red-600" />
                  </Button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <Label>Timezone</Label>
                <Input
                  value={row.timezone || ''}
                  onChange={(e) => updateRow(index, { timezone: e.target.value })}
                  placeholder="Africa/Accra"
                />
              </div>
              <div>
                <Label>Reminder hour (0–23)</Label>
                <Input
                  type="number"
                  min={0}
                  max={23}
                  value={row.reminder_hour}
                  onChange={(e) => updateRow(index, { reminder_hour: Number(e.target.value) })}
                />
              </div>
              <div>
                <Label>Minute</Label>
                <Input
                  type="number"
                  min={0}
                  max={59}
                  value={row.reminder_minute}
                  onChange={(e) => updateRow(index, { reminder_minute: Number(e.target.value) })}
                />
              </div>
              <div className="flex flex-col justify-end gap-3">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`hourly-${index}`}>Hourly repeat until done</Label>
                  <Switch
                    id={`hourly-${index}`}
                    checked={!!row.hourly_repeat_enabled}
                    onCheckedChange={(v) => updateRow(index, { hourly_repeat_enabled: v })}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor={`skip-${index}`}>Skip non-working days</Label>
                  <Switch
                    id={`skip-${index}`}
                    checked={!!row.skip_non_working_days}
                    onCheckedChange={(v) => updateRow(index, { skip_non_working_days: v })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label className="mb-2 block">Working days</Label>
              <div className="flex flex-wrap gap-2">
                {DAY_LABELS.map((d) => {
                  const active = (row.working_days || []).includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => toggleWorkingDay(index, d.value)}
                      className={`px-3 py-1.5 rounded-md text-sm border ${
                        active
                          ? 'bg-amber-50 border-amber-300 text-amber-800'
                          : 'bg-white border-slate-200 text-slate-500'
                      }`}
                    >
                      {d.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Button
        variant="outline"
        className="mt-4"
        onClick={() => setCountries((prev) => [...prev, emptyCountry()])}
      >
        <Plus size={16} className="mr-2" />
        Add country
      </Button>
      <p className="text-xs text-slate-500 mt-4">
        Signed in as {user?.full_name}. Default is 07:00 local time once per day; enable hourly repeat for follow-ups.
      </p>
    </div>
  );
};

export default ReminderSettings;
