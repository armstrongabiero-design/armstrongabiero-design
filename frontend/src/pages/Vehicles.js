import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Plus, Search, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
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
import CountrySelect, {
  DEFAULT_COUNTRY_CODE,
  getCountryBadgeClass,
  getCountryLabel,
  countryMatchesFilter,
  normalizeCountryCode,
} from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialFormData = () => ({
  country: DEFAULT_COUNTRY_CODE,
  registration_number: '',
  make: '',
  model: '',
  year: new Date().getFullYear(),
  vin: '',
  acquisition_date: new Date().toISOString().split('T')[0],
  acquisition_cost: 0,
  acquisition_currency: 'GHS',
  odometer_reading: 0,
});

const vehicleToFormData = (vehicle) => {
  const acq = vehicle.acquisition_date;
  const acquisitionDate =
    typeof acq === 'string'
      ? acq.split('T')[0]
      : acq
        ? new Date(acq).toISOString().split('T')[0]
        : createInitialFormData().acquisition_date;

  return {
    country: normalizeCountryCode(vehicle.country),
    registration_number: vehicle.registration_number,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    vin: vehicle.vin,
    acquisition_date: acquisitionDate,
    acquisition_cost: vehicle.acquisition_cost,
    acquisition_currency: vehicle.acquisition_currency,
    odometer_reading: vehicle.odometer_reading,
  };
};

const Vehicles = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'vehicle');

  const [vehicles, setVehicles] = useState([]);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const filterVehicles = useCallback(() => {
    let filtered = vehicles;

    if (countryFilter !== 'ALL') {
      filtered = filtered.filter((v) => countryMatchesFilter(v.country, countryFilter));
    }

    if (searchTerm) {
      filtered = filtered.filter(
        (v) =>
          v.registration_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
          v.model.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredVehicles(filtered);
  }, [vehicles, searchTerm, countryFilter]);

  useEffect(() => {
    fetchVehicles();
  }, [fetchVehicles]);

  useEffect(() => {
    filterVehicles();
  }, [filterVehicles]);

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
    const payload = {
      ...formData,
      acquisition_date: new Date(formData.acquisition_date).toISOString(),
      year: parseInt(formData.year, 10),
      acquisition_cost: parseFloat(formData.acquisition_cost),
      odometer_reading: parseFloat(formData.odometer_reading),
    };

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
        </div>
        {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button className="mt-4 lg:mt-0" data-testid="add-vehicle-btn" onClick={openCreateDialog}>
                <Plus size={18} className="mr-2" />
                Add Vehicle
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Vehicle' : 'Add New Vehicle'}</DialogTitle>
                <DialogDescription>
                  {editingId
                    ? 'Update the vehicle details below.'
                    : 'Fill in the details below to add a new vehicle to your fleet.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Country</Label>
                    <CountrySelect
                      value={formData.country}
                      onValueChange={(value) => setFormData({ ...formData, country: value })}
                    />
                  </div>
                  <div>
                    <Label>Registration Number</Label>
                    <Input
                      data-testid="registration-input"
                      value={formData.registration_number}
                      onChange={(e) => setFormData({ ...formData, registration_number: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Make</Label>
                    <Input
                      data-testid="make-input"
                      value={formData.make}
                      onChange={(e) => setFormData({ ...formData, make: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Model</Label>
                    <Input
                      data-testid="model-input"
                      value={formData.model}
                      onChange={(e) => setFormData({ ...formData, model: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Year</Label>
                    <Input
                      data-testid="year-input"
                      type="number"
                      value={formData.year}
                      onChange={(e) => setFormData({ ...formData, year: e.target.value })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <Label>VIN</Label>
                  <Input
                    data-testid="vin-input"
                    value={formData.vin}
                    onChange={(e) => setFormData({ ...formData, vin: e.target.value })}
                    required
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Acquisition Date</Label>
                    <Input
                      data-testid="acquisition-date-input"
                      type="date"
                      value={formData.acquisition_date}
                      onChange={(e) => setFormData({ ...formData, acquisition_date: e.target.value })}
                      required
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
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Acquisition Cost</Label>
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
                    <Label>Currency</Label>
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
        )}
      </div>

      <div className="flex flex-col lg:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
          <Input
            data-testid="search-vehicles-input"
            placeholder="Search by registration, make, or model..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <CountrySelect
          value={countryFilter}
          onValueChange={setCountryFilter}
          includeAllOption
          allLabel="All Countries"
          className="w-full lg:w-48"
        />
      </div>

      <div className="fleet-card table-container">
        <table data-testid="vehicles-table">
          <thead>
            <tr>
              <th>Registration</th>
              <th>Vehicle</th>
              <th>VIN</th>
              <th>Country</th>
              <th>Status</th>
              <th>Odometer</th>
              <th>Cost (USD)</th>
              {canEdit && <th className="w-24">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="text-center py-8 text-slate-500">
                  No vehicles found. Add your first vehicle to get started.
                </td>
              </tr>
            ) : (
              filteredVehicles.map((vehicle) => (
                <tr key={vehicle.id} data-testid={`vehicle-row-${vehicle.id}`}>
                  <td className="font-semibold">{vehicle.registration_number}</td>
                  <td>
                    {vehicle.make} {vehicle.model} ({vehicle.year})
                  </td>
                  <td className="text-xs">{vehicle.vin}</td>
                  <td>
                    <span className={getCountryBadgeClass(vehicle.country)}>
                      {getCountryLabel(vehicle.country)}
                    </span>
                  </td>
                  <td>
                    <span className={getStatusBadge(vehicle.status)}>{vehicle.status}</span>
                  </td>
                  <td>{vehicle.odometer_reading.toLocaleString()} km</td>
                  <td>${vehicle.acquisition_cost_usd.toLocaleString()}</td>
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
      </div>

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
