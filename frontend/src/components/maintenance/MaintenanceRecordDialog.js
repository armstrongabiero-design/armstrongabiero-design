import React, { useMemo, useState } from 'react';
import axios from 'axios';
import { Wrench, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { normalizeCountryCode } from '../CountrySelect';
import { WORK_STATUS_OPTIONS } from '../../utils/workStatus';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const MAINTENANCE_TYPES = [
  { value: 'ROUTINE', label: 'Routine service' },
  { value: 'CORRECTIVE', label: 'Corrective repair' },
  { value: 'PREDICTIVE', label: 'Predictive' },
];

export const CURRENCIES = ['GHS', 'LRD', 'USD', 'STN'];
const COUNTRY_CURRENCY = { GH: 'GHS', LR: 'LRD', ST: 'STN' };

const ITEM_SUGGESTIONS = [
  'Routine service', 'Oil and filter change', 'Brake pads', 'Tyre replacement',
  'Battery replacement', 'Air conditioning repair', 'Suspension repair', 'Wheel alignment',
];

/** YYYY-MM-DD from an API date, read as a calendar day (no time-zone shift). */
export const toDateInput = (value) => {
  if (!value) return '';
  const m = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const todayYmd = () => toDateInput(new Date());

const addMonths = (ymd, months) => {
  const [y, m, d] = String(ymd || '').split('-').map(Number);
  if (!y || !m || !d) return '';
  return toDateInput(new Date(y, m - 1 + months, d));
};

/** Date-only values go to the API at noon UTC so the calendar day never shifts. */
const toApiDate = (ymd) => (ymd ? `${ymd}T12:00:00.000Z` : null);

const toLocalDateTime = (value) => {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const numberOrNull = (value) => {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : n;
};

const providerKey = (record) => {
  if (record?.vendor_id) return `vendor:${record.vendor_id}`;
  if (record?.workshop_id) return `workshop:${record.workshop_id}`;
  if (record?.service_provider) return 'other';
  return 'none';
};

function buildForm({ record, vehicle, intervals }) {
  if (record) {
    return {
      vehicle_id: record.vehicle_id,
      description: record.description || '',
      maintenance_type: record.maintenance_type || 'ROUTINE',
      work_status: record.work_status || 'WORK_IN_PROGRESS',
      etc_datetime: toLocalDateTime(record.etc_datetime),
      scheduled_date: toDateInput(record.scheduled_date),
      odometer_at_maintenance: record.odometer_at_maintenance ?? '',
      next_service_odometer: record.next_service_odometer ?? '',
      next_due_date: toDateInput(record.next_due_date),
      cost: record.cost ?? '',
      currency: record.currency || 'GHS',
      provider: providerKey(record),
      provider_name: record.vendor_id || record.workshop_id ? '' : record.service_provider || '',
      notes: record.notes || '',
      autoNext: false,
    };
  }
  const today = todayYmd();
  const odo = vehicle?.odometer_reading ?? '';
  return {
    vehicle_id: vehicle?.id || '',
    description: '',
    maintenance_type: 'ROUTINE',
    work_status: 'WORK_COMPLETED',
    etc_datetime: '',
    scheduled_date: today,
    odometer_at_maintenance: odo,
    next_service_odometer: odo === '' ? '' : String(Number(odo) + (intervals.interval_km ?? 7000)),
    next_due_date: addMonths(today, intervals.interval_months ?? 3),
    cost: '',
    currency: COUNTRY_CURRENCY[normalizeCountryCode(vehicle?.country)] || 'GHS',
    provider: 'none',
    provider_name: '',
    notes: '',
    autoNext: true, // next service follows the service date and reading until edited by hand
  };
}

function Row({ label, required, children, hint }) {
  return (
    <div className="maint-form-row">
      <Label className="maint-form-label">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div>
        {children}
        {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      </div>
    </div>
  );
}

/**
 * Create or edit one maintenance record. The parent remounts it (via `key`) each time it opens,
 * so a new record never starts with the last record's values.
 */
export default function MaintenanceRecordDialog({
  open,
  onOpenChange,
  record = null,
  vehicle = null,
  vehicles = [],
  vendors = [],
  workshops = [],
  intervals = { interval_months: 3, interval_km: 7000 },
  onSaved,
}) {
  const isEdit = Boolean(record);
  const [form, setForm] = useState(() => buildForm({ record, vehicle, intervals }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const selectedVehicle = vehicles.find((v) => v.id === form.vehicle_id) || vehicle;
  const vehicleCountry = normalizeCountryCode(selectedVehicle?.country);
  const countryVendors = useMemo(
    () => vendors.filter((v) => v.is_active !== false && normalizeCountryCode(v.country) === vehicleCountry),
    [vendors, vehicleCountry]
  );
  const countryWorkshops = useMemo(
    () => workshops.filter((w) => w.active !== false && normalizeCountryCode(w.country) === vehicleCountry),
    [workshops, vehicleCountry]
  );

  const set = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const setServiceDate = (value) =>
    setForm((prev) => ({
      ...prev,
      scheduled_date: value,
      next_due_date: prev.autoNext ? addMonths(value, intervals.interval_months ?? 3) : prev.next_due_date,
    }));

  const setReading = (value) =>
    setForm((prev) => ({
      ...prev,
      odometer_at_maintenance: value,
      next_service_odometer:
        prev.autoNext && value !== '' && !Number.isNaN(Number(value))
          ? String(Number(value) + (intervals.interval_km ?? 7000))
          : prev.next_service_odometer,
    }));

  const setVehicle = (id) => {
    const next = vehicles.find((v) => v.id === id);
    setForm((prev) => ({
      ...prev,
      vehicle_id: id,
      provider: 'none',
      provider_name: '',
      ...(isEdit ? {} : {
        currency: COUNTRY_CURRENCY[normalizeCountryCode(next?.country)] || prev.currency,
      }),
    }));
    if (!isEdit && next) setReading(next.odometer_reading ?? '');
  };

  const validate = () => {
    if (!form.vehicle_id) return 'Choose a vehicle.';
    if (!form.description.trim()) return 'Enter what was done (Item).';
    if (!form.scheduled_date) return 'Enter the service date.';
    const odo = numberOrNull(form.odometer_at_maintenance);
    if (odo == null || odo < 0) return 'Enter the odometer reading at the service.';
    const cost = numberOrNull(form.cost);
    if (cost == null || cost < 0) return 'Enter the cost (0 if there was none).';
    const nextOdo = numberOrNull(form.next_service_odometer);
    if (nextOdo != null && nextOdo < odo) return 'Next service mileage must not be lower than the reading at this service.';
    if (form.next_due_date && form.next_due_date < form.scheduled_date) return 'Next service date must not be before the service date.';
    if (form.work_status === 'ETC' && !form.etc_datetime) return 'Enter the estimated completion time.';
    if (form.provider === 'other' && !form.provider_name.trim()) return 'Type the service provider name, or choose "Not recorded".';
    return '';
  };

  const submit = async (e) => {
    e.preventDefault();
    const problem = validate();
    setError(problem);
    if (problem) return;

    const [kind, providerId] = form.provider.split(':');
    const payload = {
      vehicle_id: form.vehicle_id,
      description: form.description.trim(),
      maintenance_type: form.maintenance_type,
      work_status: form.work_status,
      etc_datetime: form.work_status === 'ETC' ? new Date(form.etc_datetime).toISOString() : null,
      scheduled_date: toApiDate(form.scheduled_date),
      odometer_at_maintenance: numberOrNull(form.odometer_at_maintenance),
      next_service_odometer: numberOrNull(form.next_service_odometer),
      next_due_date: toApiDate(form.next_due_date),
      cost: numberOrNull(form.cost),
      currency: form.currency,
      vendor_id: kind === 'vendor' ? providerId : null,
      workshop_id: kind === 'workshop' ? providerId : null,
      service_provider: kind === 'other' ? form.provider_name.trim() : null,
      notes: form.notes.trim() || null,
    };
    setSaving(true);
    try {
      const { data } = isEdit
        ? await axios.put(`${API}/maintenance/${record.id}`, payload)
        : await axios.post(`${API}/maintenance`, payload);
      onSaved?.(data);
      onOpenChange(false);
    } catch (err) {
      const detail = err.response?.data?.detail;
      const message = Array.isArray(detail)
        ? detail.map((d) => String(d.msg || '').replace(/^Value error, /, '')).join(' ')
        : typeof detail === 'string' ? detail : 'Could not save the record. Check the values and try again.';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="maint-form-dialog max-w-lg p-0 overflow-hidden gap-0 [&>button.absolute]:hidden sm:rounded-xl max-h-[92vh] flex flex-col">
        <div className="maint-form-header flex items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5 text-white">
            <span
              className="inline-flex h-8 w-8 items-center justify-center rounded-full"
              style={{ backgroundColor: 'rgba(227, 170, 39, 0.25)', color: '#e3aa27' }}
            >
              <Wrench size={16} />
            </span>
            <DialogTitle className="text-white text-base font-semibold tracking-tight">
              {isEdit ? 'Edit Maintenance Record' : 'Add Maintenance Record'}
            </DialogTitle>
          </div>
          <button
            type="button"
            className="text-white/70 hover:text-[#e3aa27] transition-colors"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <DialogDescription className="sr-only">
          {isEdit ? 'Change the details of this maintenance record.' : 'Record maintenance work for a vehicle.'}
        </DialogDescription>
        <form onSubmit={submit} className="maint-form-body px-5 py-4 space-y-3 overflow-y-auto" noValidate>
          <Row label="Vehicle" required>
            <Select value={form.vehicle_id} onValueChange={setVehicle}>
              <SelectTrigger data-testid="maint-form-vehicle">
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
            {selectedVehicle && (
              <p className="text-xs text-slate-500 mt-1">
                Vehicle odometer now: {Number(selectedVehicle.odometer_reading || 0).toLocaleString()} km
              </p>
            )}
          </Row>
          <Row label="Item" required>
            <Input
              list="maint-item-options"
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="What was done, e.g. Oil and filter change"
              maxLength={200}
              data-testid="maint-form-description"
            />
            <datalist id="maint-item-options">
              {ITEM_SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </Row>
          <Row label="Type" required>
            <Select value={form.maintenance_type} onValueChange={(v) => set({ maintenance_type: v })}>
              <SelectTrigger data-testid="maint-form-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MAINTENANCE_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          <Row label="Status" required>
            <Select value={form.work_status} onValueChange={(v) => set({ work_status: v })}>
              <SelectTrigger data-testid="maint-form-status"><SelectValue /></SelectTrigger>
              <SelectContent>
                {WORK_STATUS_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Row>
          {form.work_status === 'ETC' && (
            <Row label="Estimated completion" required>
              <Input
                type="datetime-local"
                value={form.etc_datetime}
                onChange={(e) => set({ etc_datetime: e.target.value })}
              />
            </Row>
          )}
          <Row label="Service date" required>
            <Input
              type="date"
              value={form.scheduled_date}
              onChange={(e) => setServiceDate(e.target.value)}
              data-testid="maint-form-date"
            />
          </Row>
          <Row label="Odometer at service" required>
            <div className="relative">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.odometer_at_maintenance}
                onChange={(e) => setReading(e.target.value)}
                className="pr-12"
                data-testid="maint-form-odometer"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-700/70">km</span>
            </div>
          </Row>
          <Row label="Service provider">
            <Select value={form.provider} onValueChange={(v) => set({ provider: v })}>
              <SelectTrigger data-testid="maint-form-provider"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not recorded</SelectItem>
                {countryWorkshops.map((w) => (
                  <SelectItem key={w.id} value={`workshop:${w.id}`}>{w.name} (workshop)</SelectItem>
                ))}
                {countryVendors.map((v) => (
                  <SelectItem key={v.id} value={`vendor:${v.id}`}>{v.name} (vendor)</SelectItem>
                ))}
                <SelectItem value="other">Other — type a name</SelectItem>
              </SelectContent>
            </Select>
            {form.provider === 'other' && (
              <Input
                className="mt-2"
                value={form.provider_name}
                onChange={(e) => set({ provider_name: e.target.value })}
                placeholder="Garage or supplier name"
                maxLength={120}
                data-testid="maint-form-provider-name"
              />
            )}
          </Row>
          <Row label="Cost" required>
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.cost}
                onChange={(e) => set({ cost: e.target.value })}
                placeholder="0.00"
                data-testid="maint-form-cost"
              />
              <Select value={form.currency} onValueChange={(v) => set({ currency: v })}>
                <SelectTrigger className="w-24" data-testid="maint-form-currency"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </Row>
          <Row
            label="Next service mileage"
            hint={form.autoNext ? `Suggested: reading + ${(intervals.interval_km ?? 7000).toLocaleString()} km` : undefined}
          >
            <div className="relative">
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.next_service_odometer}
                onChange={(e) => set({ next_service_odometer: e.target.value, autoNext: false })}
                className="pr-12"
                data-testid="maint-form-next-odometer"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-amber-700/70">km</span>
            </div>
          </Row>
          <Row
            label="Next service date"
            hint={form.autoNext ? `Suggested: service date + ${intervals.interval_months ?? 3} months` : undefined}
          >
            <Input
              type="date"
              value={form.next_due_date}
              onChange={(e) => set({ next_due_date: e.target.value, autoNext: false })}
              data-testid="maint-form-next-date"
            />
          </Row>
          <Row label="Remark">
            <Textarea value={form.notes} onChange={(e) => set({ notes: e.target.value })} rows={2} maxLength={1000} />
          </Row>
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-md px-3 py-2" role="alert" data-testid="maint-form-error">
              {error}
            </p>
          )}
          <div className="flex justify-center gap-3 pt-2 pb-1">
            <Button type="submit" className="maint-form-submit" disabled={saving} data-testid="maint-form-submit">
              {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Submit'}
            </Button>
            <Button type="button" variant="outline" className="maint-form-cancel" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
