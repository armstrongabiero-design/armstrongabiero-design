import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Search, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Dialog,
  DialogContent,
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

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Vehicles = () => {
  const [vehicles, setVehicles] = useState([]);
  const [filteredVehicles, setFilteredVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    country: 'GHANA',
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

  useEffect(() => {
    fetchVehicles();
  }, []);

  useEffect(() => {
    filterVehicles();
  }, [vehicles, searchTerm, countryFilter]);

  const fetchVehicles = async () => {
    try {
      const response = await axios.get(`${API}/vehicles`);
      setVehicles(response.data);
    } catch (error) {
      toast.error('Failed to load vehicles');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const filterVehicles = () => {
    let filtered = vehicles;

    if (countryFilter !== 'ALL') {
      filtered = filtered.filter(v => v.country === countryFilter);
    }

    if (searchTerm) {
      filtered = filtered.filter(v =>
        v.registration_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.make.toLowerCase().includes(searchTerm.toLowerCase()) ||
        v.model.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    setFilteredVehicles(filtered);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/vehicles`, {
        ...formData,
        acquisition_date: new Date(formData.acquisition_date).toISOString(),
        year: parseInt(formData.year),
        acquisition_cost: parseFloat(formData.acquisition_cost),
        odometer_reading: parseFloat(formData.odometer_reading),
      });
      toast.success('Vehicle added successfully!');
      setDialogOpen(false);
      fetchVehicles();
      // Reset form
      setFormData({
        country: 'GHANA',
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
    } catch (error) {
      toast.error('Failed to add vehicle');
      console.error(error);
    }
  };

  const getCountryBadge = (country) => {
    const badges = {
      GHANA: 'country-badge ghana',
      LIBERIA: 'country-badge liberia',
      SAO_TOME: 'country-badge sao-tome',
    };
    return badges[country] || 'country-badge';
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button className="mt-4 lg:mt-0" data-testid="add-vehicle-btn">
              <Plus size={18} className="mr-2" />
              Add Vehicle
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Vehicle</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Country</Label>
                  <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                    <SelectTrigger data-testid="country-select">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GHANA">Ghana</SelectItem>
                      <SelectItem value="LIBERIA">Liberia</SelectItem>
                      <SelectItem value="SAO_TOME">São Tomé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Registration Number</Label>
                  <Input
                    data-testid="registration-input"
                    value={formData.registration_number}
                    onChange={(e) => setFormData({...formData, registration_number: e.target.value})}
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
                    onChange={(e) => setFormData({...formData, make: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Model</Label>
                  <Input
                    data-testid="model-input"
                    value={formData.model}
                    onChange={(e) => setFormData({...formData, model: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Year</Label>
                  <Input
                    data-testid="year-input"
                    type="number"
                    value={formData.year}
                    onChange={(e) => setFormData({...formData, year: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div>
                <Label>VIN</Label>
                <Input
                  data-testid="vin-input"
                  value={formData.vin}
                  onChange={(e) => setFormData({...formData, vin: e.target.value})}
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
                    onChange={(e) => setFormData({...formData, acquisition_date: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Odometer Reading (km)</Label>
                  <Input
                    data-testid="odometer-input"
                    type="number"
                    value={formData.odometer_reading}
                    onChange={(e) => setFormData({...formData, odometer_reading: e.target.value})}
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
                    onChange={(e) => setFormData({...formData, acquisition_cost: e.target.value})}
                    required
                  />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={formData.acquisition_currency} onValueChange={(value) => setFormData({...formData, acquisition_currency: value})}>
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
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" data-testid="submit-vehicle-btn">Add Vehicle</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
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
        <Select value={countryFilter} onValueChange={setCountryFilter}>
          <SelectTrigger className="w-full lg:w-48" data-testid="country-filter">
            <Filter size={18} className="mr-2" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Countries</SelectItem>
            <SelectItem value="GHANA">Ghana</SelectItem>
            <SelectItem value="LIBERIA">Liberia</SelectItem>
            <SelectItem value="SAO_TOME">São Tomé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Vehicles Table */}
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
            </tr>
          </thead>
          <tbody>
            {filteredVehicles.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-8 text-slate-500">
                  No vehicles found. Add your first vehicle to get started.
                </td>
              </tr>
            ) : (
              filteredVehicles.map((vehicle) => (
                <tr key={vehicle.id} data-testid={`vehicle-row-${vehicle.id}`}>
                  <td className="font-semibold">{vehicle.registration_number}</td>
                  <td>{vehicle.make} {vehicle.model} ({vehicle.year})</td>
                  <td className="text-xs">{vehicle.vin}</td>
                  <td>
                    <span className={getCountryBadge(vehicle.country)}>
                      {vehicle.country.replace('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={getStatusBadge(vehicle.status)}>
                      {vehicle.status}
                    </span>
                  </td>
                  <td>{vehicle.odometer_reading.toLocaleString()} km</td>
                  <td>${vehicle.acquisition_cost_usd.toLocaleString()}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Vehicles;
