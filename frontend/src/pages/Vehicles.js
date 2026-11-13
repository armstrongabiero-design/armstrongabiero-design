import React, { useEffect, useMemo, useState, useCallback } from 'react';
import axios from 'axios';
import { Plus, Pencil, Trash2, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Link, useSearchParams } from 'react-router-dom';
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
import CountrySelect, {
  DEFAULT_COUNTRY_CODE,
  getCountryBadgeClass,
  getCountryLabel,
  countryMatchesFilter,
  normalizeCountryCode,
} from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import VehicleAvailabilityPanel from '../components/VehicleAvailabilityPanel';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';
import { VEHICLE_MASTER_FIELDS } from '../components/VehicleMasterPanel';
import HorizontalScrollContainer from '../components/HorizontalScrollContainer';
import RecordFilters, { SortHeader } from '../components/RecordFilters';
import { ALL, distinctOptions, matchesText, sameValue, useFilters, useSort } from '../utils/filtering';

const INITIAL_FILTERS = {
  status: ALL,
  make: ALL,
  model: ALL,
  vehicle_type: ALL,
  department: ALL,
  fuel_type: ALL,
};

const VEHICLE_SORT = {
  registration: (v) => v.registration_number,
  vehicle: (v) => `${v.make || ''} ${v.model || ''}`.toLowerCase(),
  year: (v) => (v.year == null ? null : Number(v.year)),
  type: (v) => v.master_fields?.vehicle_category,
  department: (v) => v.department,
  status: (v) => v.status,
  odometer: (v) => Number(v.odometer_reading || 0),
  cost: (v) => Number(v.acquisition_cost_usd || 0),
};

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const MASTER_CORE_KEYS = new Set([
  'registration_number',
  'make',
  'model',
  'year_of_manufacture',
  'chassis_vin',
  'acquisition_date',
]);

const MASTER_EXTRA_FIELDS = VEHICLE_MASTER_FIELDS.filter((f) => !MASTER_CORE_KEYS.has(f.key));

const FIELD_GROUPS = [
  {
    title: 'Identity',
    keys: ['serial_no', 'registration_number', 'make', 'model', 'chassis_vin', 'year_of_manufacture', 'manufacturer', 'vehicle_category', 'description'],
  },
  {
    title: 'Acquisition & status',
    keys: ['acquisition_date', 'country_of_origin', 'quantity', 'use_type', 'transmission', 'active_flag'],
  },
  {
    title: 'Dimensions & capacity',
    keys: ['tyre_size_front', 'tyre_size_rear', 'tyre_size_spare', 'weight_unit', 'seating_capacity', 'max_speed', 'speed_unit', 'number_of_wheels', 'axle_config'],
  },
  {
    title: 'Engine & fuel',
    keys: ['engine_capacity_cc', 'power_value', 'power_unit', 'cylinders', 'engine_type', 'fuel_type', 'fuel_consumption', 'book_value'],
  },
];

const createInitialFormData = () => {
  const base = {
    country: DEFAULT_COUNTRY_CODE,
    registration_number: '',
    make: '',
    model: '',
    year_of_manufacture: new Date().getFullYear(),
    chassis_vin: '',
    acquisition_date: new Date().toISOString().split('T')[0],
    acquisition_cost: 0,
    acquisition_currency: 'GHS',
    odometer_reading: 0,
    department: '',
  };
  MASTER_EXTRA_FIELDS.forEach((f) => {
    base[f.key] = '';
  });
  return base;
};

const vehicleToFormData = (vehicle) => {
  const acq = vehicle.acquisition_date;
  const acquisitionDate =
    typeof acq === 'string'
      ? acq.split('T')[0]
      : acq
        ? new Date(acq).toISOString().split('T')[0]
        : createInitialFormData().acquisition_date;

  const mf = vehicle.master_fields || {};
  const form = {
    country: normalizeCountryCode(vehicle.country),
    registration_number: vehicle.registration_number || '',
    make: vehicle.make || '',
    model: vehicle.model || '',
    year_of_manufacture: vehicle.year ?? mf.year_of_manufacture ?? new Date().getFullYear(),
    chassis_vin: vehicle.vin || mf.chassis_vin || '',
    acquisition_date: acquisitionDate,
    acquisition_cost: vehicle.acquisition_cost ?? 0,
    acquisition_currency: vehicle.acquisition_currency || 'GHS',
    odometer_reading: vehicle.odometer_reading ?? 0,
    department: vehicle.department || '',
  };
  MASTER_EXTRA_FIELDS.forEach((f) => {
    const val = mf[f.key];
    form[f.key] = val == null ? '' : String(val);
  });
  return form;
};

const buildVehiclePayload = (formData) => {
  const master_fields = {};
  MASTER_EXTRA_FIELDS.forEach((f) => {
    const raw = formData[f.key];
    if (raw === '' || raw == null) return;
    if (f.type === 'number') {
      const n = Number(raw);
      if (!Number.isNaN(n)) master_fields[f.key] = n;
    } else {
      master_fields[f.key] = raw;
    }
  });

  return {
    country: formData.country,
    registration_number: formData.registration_number,
    make: formData.make,
    model: formData.model,
    year: parseInt(formData.year_of_manufacture, 10),
    vin: formData.chassis_vin,
    acquisition_date: new Date(formData.acquisition_date).toISOString(),
    acquisition_cost: parseFloat(formData.acquisition_cost),
    acquisition_currency: formData.acquisition_currency,
    odometer_reading: parseFloat(formData.odometer_reading) || 0,
    department: (formData.department || '').trim(),
    master_fields,
  };
};

const Vehicles = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'vehicle');
  const [searchParams, setSearchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') === 'availability' ? 'availability' : 'fleet';
  const countryFromUrl = searchParams.get('country') || 'ALL';

  const [activeTab, setActiveTab] = useState(tabFromUrl);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState(countryFromUrl === 'ALL' ? 'ALL' : countryFromUrl);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkCountry, setBulkCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);

  const [formData, setFormData] = useState(createInitialFormData);

  const fetchVehicles = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/vehicles`);
      setVehicles(response.data);
    } catch {
      toast.error('Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, []);

  const { filters, setFilter, clear: clearFilters, activeCount } = useFilters(INITIAL_FILTERS);

  const options = useMemo(() => {
    const forMake = filters.make === ALL ? vehicles : vehicles.filter((v) => sameValue(filters.make, v.make));
    return {
      status: distinctOptions(vehicles, (v) => v.status),
      make: distinctOptions(vehicles, (v) => v.make),
      model: distinctOptions(forMake, (v) => v.model),
      vehicle_type: distinctOptions(vehicles, (v) => v.master_fields?.vehicle_category),
      department: distinctOptions(vehicles, (v) => v.department),
      fuel_type: distinctOptions(vehicles, (v) => v.master_fields?.fuel_type),
    };
  }, [vehicles, filters.make]);

  const filteredVehicles = useMemo(() => vehicles.filter((v) => {
    if (countryFilter !== 'ALL' && !countryMatchesFilter(v.country, countryFilter)) return false;
    if (!matchesText(searchTerm, v.registration_number, v.make, v.model, v.vin, v.department, v.master_fields?.vehicle_category)) {
      return false;
    }
    return (
      sameValue(filters.status, v.status) &&
      sameValue(filters.make, v.make) &&
      sameValue(filters.model, v.model) &&
      sameValue(filters.vehicle_type, v.master_fields?.vehicle_category) &&
      sameValue(filters.department, v.department) &&
      sameValue(filters.fuel_type, v.master_fields?.fuel_type)
    );
  }), [vehicles, countryFilter, searchTerm, filters]);

  const { sorted: visibleVehicles, sort, toggle: toggleSort } = useSort(filteredVehicles, VEHICLE_SORT, 'registration');

  const clearAll = () => {
    clearFilters();
    setSearchTerm('');
    setCountryFilter('ALL');
  };

  const setMake = (value) => {
    setFilter('make', value);
    setFilter('model', ALL); // a model from another make would hide everything
  };

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  useEffect(() => {
    if (countryFromUrl && countryFromUrl !== 'ALL') {
      setCountryFilter(countryFromUrl);
    }
  }, [countryFromUrl]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    const next = new URLSearchParams(searchParams);
    if (tab === 'availability') next.set('tab', 'availability');
    else next.delete('tab');
    setSearchParams(next, { replace: true });
  };
  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setFormData(createInitialFormData());
    }
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setFormData(createInitialFormData());
    setDialogOpen(true);
  };

  const openEditDialog = (vehicle) => {
    setEditingId(vehicle.id);
    setFormData(vehicleToFormData(vehicle));
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = buildVehiclePayload(formData);

    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/vehicles/${editingId}`, payload)
          : axios.post(`${API}/vehicles`, payload),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: createInitialFormData,
      onSuccess: fetchVehicles,
      successMessage: editingId ? 'Vehicle updated successfully!' : 'Vehicle added successfully!',
      errorMessage: editingId ? 'Failed to update vehicle' : 'Failed to add vehicle',
    });
    setEditingId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/vehicles/${deleteTarget.id}`);
      toast.success('Vehicle deleted');
      setDeleteTarget(null);
      fetchVehicles();
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to delete vehicle');
    } finally {
      setDeleting(false);
    }
  };

  const resetBulkDialog = () => {
    setBulkFile(null);
    setBulkResult(null);
    setBulkCountry(DEFAULT_COUNTRY_CODE);
  };

  const handleBulkDialogOpenChange = (open) => {
    setBulkDialogOpen(open);
    if (!open) resetBulkDialog();
  };

  const downloadBulkTemplate = async () => {
    try {
      const response = await axios.get(`${API}/vehicles/bulk-upload/template`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'vehicle-import-template.xlsx');
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
    uploadData.append('country', bulkCountry);

    setBulkUploading(true);
    setBulkResult(null);
    try {
      const { data } = await axios.post(`${API}/vehicles/bulk-upload`, uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBulkResult(data);
      if (data.created > 0) {
        fetchVehicles();
        toast.success(`${data.created} vehicle${data.created === 1 ? '' : 's'} imported`);
      }
      if (data.failed > 0 && data.created === 0) {
        toast.error('No vehicles were imported. Review the errors below.');
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

  const getStatusBadge = (status) => {
    const badges = {
      ACTIVE: 'status-badge active',
      MAINTENANCE: 'status-badge maintenance',
      INACTIVE: 'status-badge inactive',
    };
    return badges[status] || 'status-badge';
  };

  if (loading) {
    return <div className="p-8 text-center">Loading vehicles...</div>;
  }

  return (
    <div className="p-6 lg:p-8" data-testid="vehicles-page">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Vehicles</h1>
          <p className="text-slate-600 mt-1">Manage your fleet across all countries</p>
          <p className="text-sm text-slate-500 mt-1">
            Vehicles use the full Master Data field set. Linked records also sync to{' '}
            <Link to="/master-data" className="text-amber-700 underline">Master Data → Vehicle Master</Link>.
          </p>
        </div>
        {canEdit && activeTab === 'fleet' && (
          <div className="flex flex-wrap gap-2 mt-4 lg:mt-0">
          <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button data-testid="add-vehicle-btn" onClick={openCreateDialog}>
                <Plus size={18} className="mr-2" />
                Add Vehicle
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Vehicle' : 'Add New Vehicle'}</DialogTitle>
                <DialogDescription>
                  {editingId
                    ? 'Update operational and Master Data fields below.'
                    : 'Enter the full Master Data fields plus odometer and acquisition cost.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Country</Label>
                    <CountrySelect
                      value={formData.country}
                      onValueChange={(value) => setFormData({ ...formData, country: value })}
                    />
                  </div>
                  <div>
                    <Label>Odometer Reading (km)</Label>
                    <Input
                      data-testid="odometer-input"
                      type="number"
                      value={formData.odometer_reading}
                      onChange={(e) => setFormData({ ...formData, odometer_reading: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Department</Label>
                    <Input
                      list="vehicle-department-options"
                      value={formData.department}
                      onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                      placeholder="e.g. Logistics"
                      maxLength={60}
                      data-testid="vehicle-department-input"
                    />
                    <datalist id="vehicle-department-options">
                      {options.department.map((o) => <option key={o.value} value={o.value} />)}
                    </datalist>
                  </div>
                </div>

                {FIELD_GROUPS.map((group) => (
                  <div key={group.title} className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-1">{group.title}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {group.keys.map((key) => {
                        const meta = VEHICLE_MASTER_FIELDS.find((f) => f.key === key) || {
                          key,
                          label: key,
                          type: key === 'year_of_manufacture' ? 'number' : 'text',
                        };
                        const required = ['registration_number', 'make', 'model', 'chassis_vin', 'year_of_manufacture', 'acquisition_date'].includes(key);
                        const testId =
                          key === 'registration_number' ? 'registration-input' :
                          key === 'make' ? 'make-input' :
                          key === 'model' ? 'model-input' :
                          key === 'year_of_manufacture' ? 'year-input' :
                          key === 'chassis_vin' ? 'vin-input' :
                          key === 'acquisition_date' ? 'acquisition-date-input' :
                          undefined;
                        return (
                          <div key={key}>
                            <Label>{key === 'vehicle_category' ? 'Vehicle Type / Category' : meta.label}{required ? ' *' : ''}</Label>
                            <Input
                              list={key === 'vehicle_category' ? 'vehicle-type-options' : undefined}
                              data-testid={testId}
                              type={key === 'acquisition_date' ? 'date' : (meta.type === 'number' ? 'number' : 'text')}
                              value={formData[key] ?? ''}
                              onChange={(e) => setFormData({ ...formData, [key]: e.target.value })}
                              required={required}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
                <datalist id="vehicle-type-options">
                  {[...new Set(['Pickup', 'Saloon', 'SUV', 'Van', 'Bus', 'Truck', 'Motorcycle', ...options.vehicle_type.map((o) => o.value)])].map(
                    (t) => <option key={t} value={t} />
                  )}
                </datalist>

                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-700 border-b border-slate-200 pb-1">Financial</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Acquisition Cost *</Label>
                      <Input
                        data-testid="acquisition-cost-input"
                        type="number"
                        step="0.01"
                        value={formData.acquisition_cost}
                        onChange={(e) => setFormData({ ...formData, acquisition_cost: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <Label>Currency *</Label>
                      <Select
                        value={formData.acquisition_currency}
                        onValueChange={(value) => setFormData({ ...formData, acquisition_currency: value })}
                      >
                        <SelectTrigger data-testid="currency-select">
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
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" data-testid="submit-vehicle-btn">
                    {editingId ? 'Save Changes' : 'Add Vehicle'}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

                    <Button variant="outline" data-testid="bulk-upload-vehicles-btn" onClick={() => setBulkDialogOpen(true)}>
            <Upload size={18} className="mr-2" />
            Bulk Upload
          </Button>

          <Dialog open={bulkDialogOpen} onOpenChange={handleBulkDialogOpenChange}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Bulk Upload Vehicles</DialogTitle>
                <DialogDescription>
                  Import multiple vehicles from an Excel file. Download the template, fill in your data, then upload.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleBulkUpload} className="space-y-4">
                <div>
                  <Label>Country (applies to all rows)</Label>
                  <CountrySelect
                    value={bulkCountry}
                    onValueChange={setBulkCountry}
                  />
                </div>
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
                  <p className="text-xs text-slate-500 mt-1">
                    Template columns match Vehicle Master Data (Serial No through Active Flag), plus Odometer Reading (km), Acquisition Cost, Currency and Department.
                  </p>
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
          </div>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="fleet" data-testid="fleet-tab">Fleet</TabsTrigger>
          <TabsTrigger value="availability" data-testid="availability-tab">Availability</TabsTrigger>
        </TabsList>

        <TabsContent value="fleet">
      <RecordFilters
        testId="vehicle-filters"
        search={searchTerm}
        onSearch={setSearchTerm}
        searchPlaceholder="Search registration, make, model, VIN, type or department"
        noun="vehicles"
        shown={visibleVehicles.length}
        total={vehicles.length}
        activeCount={activeCount + (countryFilter !== 'ALL' ? 1 : 0)}
        onClear={clearAll}
        filters={[
          { key: 'status', label: 'Status', allLabel: 'All statuses', value: filters.status, onChange: (v) => setFilter('status', v), options: options.status },
          { key: 'make', label: 'Make', allLabel: 'All makes', value: filters.make, onChange: setMake, options: options.make },
          { key: 'model', label: 'Model', allLabel: 'All models', value: filters.model, onChange: (v) => setFilter('model', v), options: options.model },
          { key: 'vehicle_type', label: 'Vehicle type', allLabel: 'All types', value: filters.vehicle_type, onChange: (v) => setFilter('vehicle_type', v), options: options.vehicle_type },
          { key: 'department', label: 'Department', allLabel: 'All departments', value: filters.department, onChange: (v) => setFilter('department', v), options: options.department },
          { key: 'fuel_type', label: 'Fuel', allLabel: 'All fuel types', value: filters.fuel_type, onChange: (v) => setFilter('fuel_type', v), options: options.fuel_type },
        ]}
      >
        <CountrySelect
          value={countryFilter}
          onValueChange={setCountryFilter}
          includeAllOption
          allLabel="All Countries"
          className="w-full md:w-56"
        />
      </RecordFilters>

      <div className="fleet-card table-container">
        <HorizontalScrollContainer>
        <table data-testid="vehicles-table" className="min-w-full">
          <thead>
            <tr>
              <SortHeader label="Registration" sortKey="registration" sort={sort} onSort={toggleSort} />
              <SortHeader label="Vehicle" sortKey="vehicle" sort={sort} onSort={toggleSort} />
              <SortHeader label="Type" sortKey="type" sort={sort} onSort={toggleSort} />
              <SortHeader label="Department" sortKey="department" sort={sort} onSort={toggleSort} />
              <th>VIN</th>
              <th>Fuel</th>
              <th>Country</th>
              <SortHeader label="Status" sortKey="status" sort={sort} onSort={toggleSort} />
              <SortHeader label="Odometer" sortKey="odometer" sort={sort} onSort={toggleSort} />
              <SortHeader label="Cost (USD)" sortKey="cost" sort={sort} onSort={toggleSort} />
              {canEdit && <th className="w-24">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visibleVehicles.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 11 : 10} className="text-center py-8 text-slate-500">
                  {vehicles.length === 0 ? 'No vehicles found. Add your first vehicle to get started.' : 'No vehicles match these filters.'}
                  {vehicles.length > 0 && (
                    <Button variant="link" className="ml-1 h-auto p-0" onClick={clearAll}>
                      Clear filters
                    </Button>
                  )}
                </td>
              </tr>
            ) : (
              visibleVehicles.map((vehicle) => (
                <tr key={vehicle.id} data-testid={`vehicle-row-${vehicle.id}`}>
                  <td className="font-semibold">{vehicle.registration_number}</td>
                  <td>
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                  </td>
                  <td className="text-xs text-slate-600">{vehicle.master_fields?.vehicle_category || '—'}</td>
                  <td className="text-xs text-slate-600">{vehicle.department || '—'}</td>
                  <td className="text-xs">{vehicle.vin}</td>
                  <td className="text-xs text-slate-600">{vehicle.master_fields?.fuel_type || '—'}</td>
                  <td>
                    <span className={getCountryBadgeClass(vehicle.country)}>
                      {getCountryLabel(vehicle.country)}
                    </span>
                  </td>
                  <td>
                    <span className={getStatusBadge(vehicle.status)}>{vehicle.status}</span>
                  </td>
                  <td>{(vehicle.odometer_reading || 0).toLocaleString()} km</td>
                  <td>${(vehicle.acquisition_cost_usd || 0).toLocaleString()}</td>
                  {canEdit && (
                    <td>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit vehicle"
                          onClick={() => openEditDialog(vehicle)}
                        >
                          <Pencil size={16} />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete vehicle"
                            onClick={() => setDeleteTarget(vehicle)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </HorizontalScrollContainer>
      </div>
        </TabsContent>

        <TabsContent value="availability">
          <VehicleAvailabilityPanel
            canEdit={canEdit}
            initialCountry={countryFromUrl !== 'ALL' ? countryFromUrl : countryFilter}
          />
        </TabsContent>
      </Tabs>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="Delete vehicle?"
        description={
          deleteTarget
            ? `Permanently delete ${deleteTarget.registration_number} (${deleteTarget.make} ${deleteTarget.model})? This cannot be undone.`
            : undefined
        }
      />
    </div>
  );
};

export default Vehicles;
