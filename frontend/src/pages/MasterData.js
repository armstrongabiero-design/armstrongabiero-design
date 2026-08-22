import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Pencil, Trash2, Link as LinkIcon, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import CountrySelect, { DEFAULT_COUNTRY_CODE, fetchCountries, getCountryLabel } from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import VehicleMasterPanel from '../components/VehicleMasterPanel';
import { canEditFleetRecord, canHardDelete, canExportMasterData } from '../utils/permissions';
import { WORK_STATUS_OPTIONS } from '../utils/workStatus';
import { completeDialogSubmit } from '../utils/formUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DOCUMENT_TYPES = [
  { value: 'ROADWORTHY_CERT', label: 'Roadworthy Certificate' },
  { value: 'AMA_STICKER', label: 'AMA Sticker' },
  { value: 'VEHICLE_REGISTRATION', label: 'Vehicle Registration Certificate (VRC)' },
  { value: 'INSURANCE', label: 'Insurance Document' },
  { value: 'DRIVER_LICENSE', label: "Driver's License" },
  { value: 'OTHER', label: 'Other Document' },
];

const MAINTENANCE_TYPES = [
  { value: 'PREDICTIVE', label: 'Predictive' },
  { value: 'CORRECTIVE', label: 'Corrective' },
  { value: 'ROUTINE', label: 'Routine' },
];

const EXPORT_ENTITIES = [
  { id: 'vehicles', label: 'Vehicle Master' },
  { id: 'workshops', label: 'Workshops / Garages' },
  { id: 'document_types', label: 'Document Types' },
  { id: 'maintenance_types', label: 'Maintenance Types' },
  { id: 'work_statuses', label: 'Work Statuses' },
];

const createWorkshopForm = () => ({
  name: '',
  workshop_type: 'INTERNAL',
  country: DEFAULT_COUNTRY_CODE,
  address: '',
  phone: '',
  active: true,
});

const MasterData = () => {
  const { user, token } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'master_workshop');
  const canExport = canExportMasterData(user?.role);
  const canDeleteVehicleMaster = canHardDelete(user?.role, 'vehicle_master');
  const canManageSettings = ['GROUP_FLEET_MANAGER', 'FLEET_MANAGER'].includes(user?.role);

  const [workshops, setWorkshops] = useState([]);
  const [countries, setCountries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(createWorkshopForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFmt, setExportFmt] = useState('xlsx');
  const [exportEntities, setExportEntities] = useState(['vehicles', 'workshops']);
  const [exporting, setExporting] = useState(false);
  const [maintDefaults, setMaintDefaults] = useState({ interval_months: 3, interval_km: 7000 });
  const [maintDefaultsLoading, setMaintDefaultsLoading] = useState(true);
  const [maintDefaultsSaving, setMaintDefaultsSaving] = useState(false);

  const fetchWorkshops = useCallback(async () => {
    try {
      const params = {};
      if (countryFilter !== 'ALL') params.country = countryFilter;
      const [wsRes, countriesList] = await Promise.all([
        axios.get(`${API}/master/workshops`, { params }),
        fetchCountries().catch(() => [
          { code: 'GH', name: 'Ghana' },
          { code: 'LR', name: 'Liberia' },
          { code: 'ST', name: 'São Tomé and Príncipe' },
        ]),
      ]);
      setWorkshops(wsRes.data);
      setCountries(countriesList);
    } catch {
      toast.error('Failed to load master data');
    } finally {
      setLoading(false);
    }
  }, [countryFilter]);

  useEffect(() => {
    setLoading(true);
    fetchWorkshops();
  }, [fetchWorkshops]);

  const fetchMaintDefaults = useCallback(async () => {
    setMaintDefaultsLoading(true);
    try {
      const { data } = await axios.get(`${API}/settings/maintenance-defaults`);
      setMaintDefaults({
        interval_months: data.interval_months ?? 3,
        interval_km: data.interval_km ?? 7000,
      });
    } catch {
      toast.error('Failed to load maintenance interval settings');
    } finally {
      setMaintDefaultsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMaintDefaults();
  }, [fetchMaintDefaults]);

  const saveMaintDefaults = async (e) => {
    e.preventDefault();
    if (!canManageSettings) return;
    setMaintDefaultsSaving(true);
    try {
      const { data } = await axios.put(`${API}/settings/maintenance-defaults`, {
        interval_months: Number(maintDefaults.interval_months),
        interval_km: Number(maintDefaults.interval_km),
      });
      setMaintDefaults(data);
      toast.success('Maintenance interval defaults saved');
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to save settings');
    } finally {
      setMaintDefaultsSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(createWorkshopForm());
    setDialogOpen(true);
  };

  const openEdit = (ws) => {
    setEditingId(ws.id);
    setFormData({
      name: ws.name,
      workshop_type: ws.workshop_type || 'INTERNAL',
      country: ws.country || DEFAULT_COUNTRY_CODE,
      address: ws.address || '',
      phone: ws.phone || '',
      active: ws.active !== false,
    });
    setDialogOpen(true);
  };

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setFormData(createWorkshopForm());
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      address: formData.address || null,
      phone: formData.phone || null,
    };
    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/master/workshops/${editingId}`, payload)
          : axios.post(`${API}/master/workshops`, payload),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: createWorkshopForm,
      onSuccess: fetchWorkshops,
      successMessage: editingId ? 'Workshop updated' : 'Workshop created',
      errorMessage: 'Failed to save workshop',
    });
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/master/workshops/${deleteTarget.id}`);
      toast.success('Workshop deleted');
      setDeleteTarget(null);
      fetchWorkshops();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete');
    } finally {
      setDeleting(false);
    }
  };

  const toggleExportEntity = (id) => {
    setExportEntities((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleExport = async () => {
    if (!exportEntities.length) {
      toast.error('Select at least one entity');
      return;
    }
    setExporting(true);
    try {
      const res = await axios.post(
        `${API}/master/export`,
        { entities: exportEntities, fmt: exportFmt },
        {
          headers: { Authorization: `Bearer ${token}` },
          responseType: 'blob',
        }
      );
      const blob = new Blob([res.data], { type: res.headers['content-type'] });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `master-data-export.${exportFmt}`;
      a.click();
      window.URL.revokeObjectURL(url);
      toast.success('Export downloaded');
      setExportOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  if (!canEdit) {
    return <div className="p-8 text-center text-slate-600">Staff access required</div>;
  }

  if (loading) {
    return <div className="p-8 text-center">Loading master data...</div>;
  }

  return (
    <div className="p-6 lg:p-8" data-testid="master-data-page">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Master Data</h1>
          <p className="text-slate-600 mt-1">Reference configuration used across fleet modules</p>
          <p className="text-sm text-slate-500 mt-2 flex items-center gap-1">
            <LinkIcon size={14} />
            Vendors are managed under{' '}
            <Link to="/vendors" className="text-amber-700 underline">Vendors</Link>
            {' · '}
            Operational fleet under{' '}
            <Link to="/vehicles" className="text-amber-700 underline">Vehicles</Link>
          </p>
        </div>
        {canExport && (
          <Button variant="outline" onClick={() => setExportOpen(true)}>
            <Download size={16} className="mr-2" />
            Export
          </Button>
        )}
      </div>

      <Tabs defaultValue="vehicles">
        <TabsList className="flex flex-wrap h-auto gap-1 mb-4">
          <TabsTrigger value="vehicles">Vehicle Master</TabsTrigger>
          <TabsTrigger value="workshops">Workshops / Garages</TabsTrigger>
          <TabsTrigger value="countries">Countries</TabsTrigger>
          <TabsTrigger value="document-types">Document Types</TabsTrigger>
          <TabsTrigger value="work-statuses">Work Statuses</TabsTrigger>
          <TabsTrigger value="maintenance-types">Maintenance Types</TabsTrigger>
          <TabsTrigger value="maintenance-intervals">Maintenance Intervals</TabsTrigger>
          <TabsTrigger value="validation">Validation Process</TabsTrigger>
          <TabsTrigger value="safety-score">Safety Score</TabsTrigger>
        </TabsList>

        <TabsContent value="vehicles">
          <VehicleMasterPanel canEdit={canEdit} canDelete={canDeleteVehicleMaster} />
        </TabsContent>

        <TabsContent value="workshops">
          <div className="flex justify-between items-center mb-4 gap-2 flex-wrap">
            <CountrySelect
              value={countryFilter}
              onValueChange={setCountryFilter}
              includeAllOption
              allLabel="All Countries"
              className="w-full sm:w-64"
            />
            <Button onClick={openCreate}>
              <Plus size={18} className="mr-2" />
              Add Workshop
            </Button>
          </div>
          <div className="fleet-card table-container">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Country</th>
                  <th>Phone</th>
                  <th>Status</th>
                  <th className="w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workshops.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-8 text-slate-500">No workshops configured</td></tr>
                ) : (
                  workshops.map((ws) => (
                    <tr key={ws.id}>
                      <td className="font-semibold">{ws.name}</td>
                      <td>{ws.workshop_type}</td>
                      <td>{getCountryLabel(ws.country) || ws.country}</td>
                      <td>{ws.phone || '—'}</td>
                      <td>
                        <span className={ws.active !== false ? 'status-badge active' : 'status-badge'}>
                          {ws.active !== false ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(ws)}>
                            <Pencil size={16} />
                          </Button>
                          {canDelete && (
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteTarget(ws)}>
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
          </div>
        </TabsContent>

        <TabsContent value="countries">
          <div className="fleet-card p-4">
            <p className="text-sm text-slate-600 mb-4">
              Full ISO country list used across the fleet ({countries.length} countries).
            </p>
            <ul className="space-y-2 max-h-96 overflow-y-auto">
              {countries.map((c) => (
                <li key={c.code} className="flex justify-between border-b border-slate-100 py-2 text-sm">
                  <span>{c.name}</span>
                  <span className="font-mono text-slate-500">{c.code}</span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="document-types">
          <div className="fleet-card p-4">
            <ul className="space-y-2">
              {DOCUMENT_TYPES.map((t) => (
                <li key={t.value} className="flex justify-between border-b border-slate-100 py-2 text-sm">
                  <span>{t.label}</span>
                  <span className="font-mono text-slate-500">{t.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="work-statuses">
          <div className="fleet-card p-4">
            <ul className="space-y-2">
              {WORK_STATUS_OPTIONS.map((t) => (
                <li key={t.value} className="flex justify-between border-b border-slate-100 py-2 text-sm">
                  <span>{t.label}</span>
                  <span className="font-mono text-slate-500">{t.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="maintenance-types">
          <div className="fleet-card p-4">
            <ul className="space-y-2">
              {MAINTENANCE_TYPES.map((t) => (
                <li key={t.value} className="flex justify-between border-b border-slate-100 py-2 text-sm">
                  <span>{t.label}</span>
                  <span className="font-mono text-slate-500">{t.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </TabsContent>

        <TabsContent value="maintenance-intervals">
          <div className="fleet-card p-5 max-w-lg">
            <h2 className="text-lg font-semibold text-slate-800 mb-1">Auto Next Maintenance</h2>
            <p className="text-sm text-slate-600 mb-4">
              When creating a maintenance record, the system calculates next due date and next service odometer from these defaults if not entered manually.
            </p>
            {maintDefaultsLoading ? (
              <p className="text-sm text-slate-500">Loading settings…</p>
            ) : (
              <form onSubmit={saveMaintDefaults} className="space-y-4">
                <div>
                  <Label htmlFor="interval_months">Interval (months)</Label>
                  <Input
                    id="interval_months"
                    type="number"
                    min={1}
                    value={maintDefaults.interval_months}
                    onChange={(e) => setMaintDefaults({ ...maintDefaults, interval_months: e.target.value })}
                    disabled={!canManageSettings}
                  />
                  <p className="text-xs text-slate-500 mt-1">Added to current maintenance date (default: 3 months).</p>
                </div>
                <div>
                  <Label htmlFor="interval_km">Interval (km)</Label>
                  <Input
                    id="interval_km"
                    type="number"
                    min={1}
                    value={maintDefaults.interval_km}
                    onChange={(e) => setMaintDefaults({ ...maintDefaults, interval_km: e.target.value })}
                    disabled={!canManageSettings}
                  />
                  <p className="text-xs text-slate-500 mt-1">Added to odometer at maintenance (default: 7,000 km).</p>
                </div>
                {canManageSettings ? (
                  <Button type="submit" disabled={maintDefaultsSaving}>
                    {maintDefaultsSaving ? 'Saving…' : 'Save Defaults'}
                  </Button>
                ) : (
                  <p className="text-xs text-slate-500">Only Group Fleet Manager or Fleet Manager can change these values.</p>
                )}
              </form>
            )}
          </div>
        </TabsContent>

        <TabsContent value="validation">
          <div className="fleet-card p-5 space-y-6 text-sm text-slate-700">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">System Validation Process</h2>
              <p className="text-slate-600">
                Rules enforced on create and update. Required fields must be present; optional fields may be omitted.
                Updates only validate fields that are sent.
              </p>
            </div>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Cross-cutting rules</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Country:</strong> ISO alpha-2 code (e.g. GH, LR, ST). Legacy names (Ghana, Liberia, São Tomé) are normalized where supported.</li>
                <li><strong>Currency:</strong> Must be one of GHS, LRD, USD, STN.</li>
                <li><strong>Dates:</strong> ISO date/datetime; stored in MongoDB as ISO strings (UTC).</li>
                <li><strong>Auth / roles:</strong> Most create/update routes require staff (Group Fleet Manager, Fleet Manager, or Fleet Officer). Drivers may create own logbook, pre-trip, and maintenance requests.</li>
                <li><strong>Password (registration):</strong> Minimum 8 characters with strength checks.</li>
                <li><strong>Documents / photos:</strong> Max size and allowed MIME types enforced (PDF, images, and Office for documents).</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Vehicles</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Country, Registration Number, Make, Model, Year, VIN, Acquisition Date, Acquisition Cost, Acquisition Currency.</p>
              <p className="mb-1"><span className="text-slate-500">Defaults / optional:</span> Status (ACTIVE), Odometer (0), country-specific fields.</p>
              <p><span className="text-slate-500">Update:</span> Any subset of the above; acquisition cost/currency recalculates USD when changed.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Drivers</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Country, First Name, Last Name, License Number, License Expiry, Phone.</p>
              <p className="mb-1"><span className="text-slate-500">Optional:</span> Email. Safety Score defaults to 100; Total Incidents to 0; Status ACTIVE.</p>
              <p><span className="text-slate-500">Update:</span> Profile fields and optional Safety Score / Status overrides.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Maintenance records</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Vehicle, Type (Predictive / Corrective / Routine), Description, Scheduled Date, Odometer at Maintenance, Cost, Currency.</p>
              <p className="mb-1"><span className="text-slate-500">Conditional:</span> If Work Status = ETC, Estimated Completion Datetime is required.</p>
              <p><span className="text-slate-500">Optional:</span> Next Due Date, Next Service Odometer, Workshop, Notes, Work Status (default Work In Progress).</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Maintenance requests</h3>
              <p className="mb-1"><span className="text-slate-500">Create:</span> Vehicle, request type/description, priority; driver is taken from the authenticated user when applicable.</p>
              <p><span className="text-slate-500">Update / approval:</span> Pending requests only for driver edits; managers approve/reject with optional rejection reason.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Pre-trip checklist</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Driver, Vehicle, and checklist item statuses (OK / Attention / Failed) for each inspection item.</p>
              <p><span className="text-slate-500">Rules:</span> One checklist per driver–vehicle per calendar day (UTC day window). Damage photos optional (images only, size-capped).</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Driver logbook</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Driver, Vehicle, Date, Start Time, Start Location, Start Odometer, Purpose.</p>
              <p className="mb-1"><span className="text-slate-500">Optional:</span> End Time/Location/Odometer, fuel, speeds, speed-limit violations, harsh events, idle time, notes.</p>
              <p><span className="text-slate-500">Bulk import:</span> Requires a non-failed pre-trip checklist for that driver/vehicle/date.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Documents</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Country, Document Type, Entity (vehicle or driver), Document Number, Issue Date. Expiry Date required except for Vehicle Registration Certificate (VRC), where it is optional.</p>
              <p><span className="text-slate-500">File:</span> Optional on metadata create; upload validates MIME and size. Expiry drives compliance alerts only when a date is present.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Tires</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Serial Number, Brand, Model, Size, Country, Purchase Date, Purchase Cost, Currency.</p>
              <p><span className="text-slate-500">Optional:</span> Vehicle (registration on bulk import), Position, Mileage, Tread Depth, Notes. Status defaults to SPARE. Bulk upsert keys on Serial Number.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Inventory</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Name, SKU, Category, Country, Location, Unit Cost, Currency.</p>
              <p><span className="text-slate-500">Bulk upload:</span> Upsert by SKU; Quantity / Reorder Level / Lead Time optional with defaults.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Expenditures</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Country, Category, Description, Amount, Currency, Date.</p>
              <p><span className="text-slate-500">Bulk upload:</span> Optional Vehicle Registration and Driver License Number must match existing records if provided.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Assets</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Vehicle, Acquisition Date, Acquisition Cost (and currency as applicable).</p>
              <p><span className="text-slate-500">Resale:</span> Predictive value via Gemini when configured; otherwise declining-balance formula from acquisition cost, age, and depreciation rate.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Safety incidents</h3>
              <p className="mb-1"><span className="text-slate-500">Create required:</span> Driver, Vehicle, Incident Date, Type, Severity (LOW / MEDIUM / HIGH), Description, Location.</p>
              <p><span className="text-slate-500">Side effect:</span> Creating an incident reduces the driver’s stored Safety Score (see Safety Score tab). Cost/currency optional.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">Workshops (master)</h3>
              <p><span className="text-slate-500">Create / update required:</span> Name, Workshop Type (Internal / External), Country. Address, Phone, Active flag optional.</p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">User registration</h3>
              <p className="mb-1"><span className="text-slate-500">Self-register:</span> Email, Password (strength rules), Full Name; role limited to User, Driver, Fleet Manager, or Fleet Officer.</p>
              <p><span className="text-slate-500">Conditional:</span> Country required for Fleet Manager and Fleet Officer. Account awaits manager approval before login (except bootstrap GFM).</p>
            </section>
          </div>
        </TabsContent>

        <TabsContent value="safety-score">
          <div className="fleet-card p-5 space-y-6 text-sm text-slate-700">
            <div>
              <h2 className="text-lg font-semibold text-slate-800 mb-1">Driver Safety Score</h2>
              <p className="text-slate-600">
                The system uses a 0–100 score. There are two related views: the <strong>stored driver score</strong>
                (profile / Safety module) and the <strong>personal dashboard snapshot</strong> (recent speeding from the logbook).
              </p>
            </div>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">1. Stored driver Safety Score (authoritative for fleet views)</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Initial value:</strong> 100 when a driver is created.</li>
                <li><strong>Range:</strong> Clamped to a minimum of 0 (never negative).</li>
                <li><strong>Trigger:</strong> When a Safety Incident is recorded for that driver.</li>
                <li><strong>Formula:</strong> <code className="text-xs bg-slate-100 px-1 rounded">new_score = max(0, current_score − penalty)</code></li>
              </ul>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200">
                      <th className="py-2 pr-4">Incident severity</th>
                      <th className="py-2 pr-4">Weight / penalty</th>
                      <th className="py-2">Effect</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-mono text-xs">LOW</td>
                      <td className="py-2 pr-4">−2 points</td>
                      <td className="py-2">Minor incident</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-mono text-xs">MEDIUM</td>
                      <td className="py-2 pr-4">−5 points</td>
                      <td className="py-2">Default if severity is unrecognized</td>
                    </tr>
                    <tr className="border-b border-slate-100">
                      <td className="py-2 pr-4 font-mono text-xs">HIGH</td>
                      <td className="py-2 pr-4">−10 points</td>
                      <td className="py-2">Serious incident</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="mt-3">
                Each incident also increments <strong>Total Incidents</strong> on the driver record.
                Editing or deleting an incident does not automatically reverse prior penalties; score can be adjusted manually on the driver profile if needed.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">2. Personal dashboard Safety Score (driver “My Dashboard”)</h3>
              <p className="mb-2">
                Shown to the logged-in driver as a period snapshot based on logbook speeding, not the stored incident score:
              </p>
              <p className="mb-2">
                <code className="text-xs bg-slate-100 px-1 rounded">score = max(0, 100 − (speed_limit_violations_in_last_30_days × 10))</code>
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Metric:</strong> Sum of <code className="text-xs">speed_limit_violations</code> across the driver’s logbook entries in the last 30 days.</li>
                <li><strong>Weight:</strong> 10 points deducted per recorded violation count unit.</li>
                <li><strong>Floor:</strong> 0.</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">3. Display bands (UI)</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>80–100:</strong> Good (green)</li>
                <li><strong>60–79:</strong> Caution (amber / yellow)</li>
                <li><strong>0–59:</strong> Poor (red)</li>
              </ul>
              <p className="mt-2 text-slate-600">
                Used on the driver dashboard banner and Safety module progress bars.
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">4. Related metrics (not part of the score formula)</h3>
              <p className="mb-2">
                Logbook fields that support safety monitoring and alerts but are not currently weighted into the stored Safety Score:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Max / average speed (km/h)</li>
                <li>Harsh braking events</li>
                <li>Harsh acceleration events</li>
                <li>Idle time (minutes)</li>
              </ul>
              <p className="mt-2 text-slate-600">
                Speeding entries can also surface as dashboard alerts for managers (WARNING severity).
              </p>
            </section>

            <section>
              <h3 className="font-semibold text-slate-800 mb-2">5. Worked example</h3>
              <p>
                Driver starts at 100. One MEDIUM incident → 95. One HIGH incident → 85.
                Separately, if the driver’s logbook shows 3 speed-limit violation counts in 30 days, the personal dashboard shows
                max(0, 100 − 30) = 70, while the Drivers/Safety list still shows the stored score of 85 until further incidents or a manual update.
              </p>
            </section>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Workshop' : 'Add Workshop / Garage'}</DialogTitle>
            <DialogDescription>Master workshop used when creating maintenance and workshop jobs.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Name *</Label>
              <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
            </div>
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
              <Label>Country</Label>
              <CountrySelect value={formData.country} onValueChange={(v) => setFormData({ ...formData, country: v })} />
            </div>
            <div>
              <Label>Address</Label>
              <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} />
            </div>
            <div>
              <Label>Active</Label>
              <Select
                value={formData.active ? 'yes' : 'no'}
                onValueChange={(v) => setFormData({ ...formData, active: v === 'yes' })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="yes">Active</SelectItem>
                  <SelectItem value="no">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
              <Button type="submit">{editingId ? 'Save' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete workshop?"
        description={deleteTarget ? `Permanently delete ${deleteTarget.name}?` : undefined}
      />

      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export Master Data</DialogTitle>
            <DialogDescription>
              Choose entities and format. Available to Group Fleet Manager and Fleet Manager.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              {EXPORT_ENTITIES.map((ent) => (
                <label key={ent.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={exportEntities.includes(ent.id)}
                    onChange={() => toggleExportEntity(ent.id)}
                  />
                  {ent.label}
                </label>
              ))}
            </div>
            <div>
              <Label>Format</Label>
              <Select value={exportFmt} onValueChange={setExportFmt}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="xlsx">Excel (.xlsx)</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                  <SelectItem value="docx">Word (.docx)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
              <Button onClick={handleExport} disabled={exporting}>
                {exporting ? 'Exporting…' : 'Download'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MasterData;
