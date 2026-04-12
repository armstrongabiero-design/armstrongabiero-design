import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Plus, Book } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DriverLogbook = () => {
  const { user, token, isDriverOrUser } = useAuth();
  const isPersonalView = isDriverOrUser && isDriverOrUser();
  
  const [entries, setEntries] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(isPersonalView ? (user?.driver_id || user?.id) : '');
  const [driverSummary, setDriverSummary] = useState(null);

  const [formData, setFormData] = useState({
    driver_id: isPersonalView ? (user?.driver_id || user?.id) : '',
    vehicle_id: '',
    country: user?.country || 'GHANA',
    date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    start_location: '',
    end_location: '',
    start_odometer: '',
    end_odometer: '',
    purpose: '',
    fuel_used_liters: '',
    notes: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [entriesRes, driversRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/logbook`, { headers }),
        axios.get(`${API}/drivers`, { headers }),
        axios.get(`${API}/vehicles`, { headers }),
      ]);
      
      let filteredEntries = entriesRes.data;
      if (isPersonalView) {
        const userId = user?.driver_id || user?.id;
        filteredEntries = entriesRes.data.filter(e => e.driver_id === userId);
      }
      
      setEntries(filteredEntries);
      setDrivers(driversRes.data);
      setVehicles(vehiclesRes.data);
    } catch {
      toast.error('Failed to load logbook data');
    } finally {
      setLoading(false);
    }
  }, [token, isPersonalView, user]);

  const fetchDriverSummary = useCallback(async (driverId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`${API}/logbook/summary/${driverId}`, { headers });
      setDriverSummary(response.data);
    } catch {
      // Silent fail
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const driverId = isPersonalView ? (user?.driver_id || user?.id) : selectedDriver;
    if (driverId) {
      fetchDriverSummary(driverId);
    }
  }, [selectedDriver, isPersonalView, user, fetchDriverSummary]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const driverId = isPersonalView ? (user?.driver_id || user?.id) : formData.driver_id;
    const driver = drivers.find(d => d.id === driverId);
    
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/logbook`, {
        ...formData,
        driver_id: driverId,
        country: driver?.country || user?.country || formData.country,
        date: new Date(formData.date).toISOString(),
        start_time: new Date(`${formData.date}T${formData.start_time}`).toISOString(),
        end_time: formData.end_time ? new Date(`${formData.date}T${formData.end_time}`).toISOString() : null,
        start_odometer: parseFloat(formData.start_odometer),
        end_odometer: formData.end_odometer ? parseFloat(formData.end_odometer) : null,
        fuel_used_liters: formData.fuel_used_liters ? parseFloat(formData.fuel_used_liters) : null,
      }, { headers });
      toast.success('Logbook entry added!');
      setDialogOpen(false);
      fetchData();
      setFormData({
        driver_id: isPersonalView ? (user?.driver_id || user?.id) : '',
        vehicle_id: '',
        country: user?.country || 'GHANA',
        date: new Date().toISOString().split('T')[0],
        start_time: '',
        end_time: '',
        start_location: '',
        end_location: '',
        start_odometer: '',
        end_odometer: '',
        purpose: '',
        fuel_used_liters: '',
        notes: '',
      });
    } catch {
      toast.error('Failed to add logbook entry');
    }
  };

  const filteredEntries = !isPersonalView && selectedDriver
    ? entries.filter(e => e.driver_id === selectedDriver)
    : entries;

  return (
    <div className="p-6 lg:p-8" data-testid="driver-logbook-page">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            {isPersonalView ? 'My Logbook' : 'Driver Logbook'}
          </h1>
          <p className="text-slate-600 mt-1">
            {isPersonalView 
              ? 'Your trip logs and driving records'
              : 'Digital trip logs and driver performance tracking'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!isPersonalView && (
            <Select value={selectedDriver || "ALL"} onValueChange={(v) => setSelectedDriver(v === "ALL" ? "" : v)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="All Drivers" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Drivers</SelectItem>
                {drivers.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-entry-btn">
                <Plus size={18} className="mr-2" />
                Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New Logbook Entry</DialogTitle>
                <DialogDescription>
                  {isPersonalView ? 'Record your trip details.' : 'Record a trip or driving session.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {!isPersonalView ? (
                    <div>
                      <Label>Driver *</Label>
                      <Select value={formData.driver_id} onValueChange={(value) => setFormData({...formData, driver_id: value})}>
                        <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                        <SelectContent>
                          {drivers.map(d => (
                            <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <div className="bg-slate-50 p-3 rounded-lg">
                      <Label className="text-xs text-slate-500">Driver</Label>
                      <p className="font-medium text-slate-800">{user?.full_name}</p>
                    </div>
                  )}
                  <div>
                    <Label>Vehicle *</Label>
                    <Select value={formData.vehicle_id} onValueChange={(value) => setFormData({...formData, vehicle_id: value})}>
                      <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>
                        {vehicles.map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.registration_number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Date *</Label>
                    <Input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Start Time *</Label>
                    <Input type="time" value={formData.start_time} onChange={(e) => setFormData({...formData, start_time: e.target.value})} required />
                  </div>
                  <div>
                    <Label>End Time</Label>
                    <Input type="time" value={formData.end_time} onChange={(e) => setFormData({...formData, end_time: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Location *</Label>
                    <Input value={formData.start_location} onChange={(e) => setFormData({...formData, start_location: e.target.value})} required />
                  </div>
                  <div>
                    <Label>End Location</Label>
                    <Input value={formData.end_location} onChange={(e) => setFormData({...formData, end_location: e.target.value})} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Start Odometer (km) *</Label>
                    <Input type="number" step="0.1" value={formData.start_odometer} onChange={(e) => setFormData({...formData, start_odometer: e.target.value})} required />
                  </div>
                  <div>
                    <Label>End Odometer (km)</Label>
                    <Input type="number" step="0.1" value={formData.end_odometer} onChange={(e) => setFormData({...formData, end_odometer: e.target.value})} />
                  </div>
                </div>

                <div>
                  <Label>Purpose of Trip *</Label>
                  <Input value={formData.purpose} onChange={(e) => setFormData({...formData, purpose: e.target.value})} placeholder="e.g., Delivery to Accra Office" required />
                </div>

                <div>
                  <Label>Fuel Used (Liters)</Label>
                  <Input type="number" step="0.1" value={formData.fuel_used_liters} onChange={(e) => setFormData({...formData, fuel_used_liters: e.target.value})} />
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Any additional notes..." />
                </div>

                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Save Entry</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Driver Summary */}
      {driverSummary && (isPersonalView || selectedDriver) && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-blue-600 text-sm font-medium">Total Trips</p>
            <p className="text-2xl font-bold text-blue-800">{driverSummary.total_entries || 0}</p>
          </div>
          <div className="bg-green-50 rounded-lg p-4">
            <p className="text-green-600 text-sm font-medium">Total Distance</p>
            <p className="text-2xl font-bold text-green-800">{(driverSummary.total_distance_km || 0).toLocaleString()} km</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4">
            <p className="text-amber-600 text-sm font-medium">Fuel Used</p>
            <p className="text-2xl font-bold text-amber-800">{(driverSummary.total_fuel_liters || 0).toFixed(1)} L</p>
          </div>
          <div className="bg-amber-50 rounded-lg p-4">
            <p className="text-amber-600 text-sm font-medium">Avg Efficiency</p>
            <p className="text-2xl font-bold text-amber-800">{(driverSummary.avg_fuel_efficiency || 0).toFixed(1)} km/L</p>
          </div>
        </div>
      )}

      {/* Logbook Table */}
      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              {!isPersonalView && <th>Driver</th>}
              <th>Vehicle</th>
              <th>Route</th>
              <th>Distance</th>
              <th>Purpose</th>
              <th>Fuel</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={isPersonalView ? 6 : 7} className="text-center py-8 text-slate-500">
                  No logbook entries found
                </td>
              </tr>
            ) : (
              filteredEntries.map(entry => {
                const driver = drivers.find(d => d.id === entry.driver_id);
                const vehicle = vehicles.find(v => v.id === entry.vehicle_id);
                const distance = entry.end_odometer && entry.start_odometer
                  ? (entry.end_odometer - entry.start_odometer).toFixed(1)
                  : '-';
                return (
                  <tr key={entry.id}>
                    <td>{new Date(entry.date).toLocaleDateString()}</td>
                    {!isPersonalView && <td>{driver?.first_name} {driver?.last_name}</td>}
                    <td className="font-semibold">{vehicle?.registration_number || 'N/A'}</td>
                    <td className="text-sm">
                      {entry.start_location} &rarr; {entry.end_location || '...'}
                    </td>
                    <td>{distance} km</td>
                    <td className="text-sm max-w-xs truncate">{entry.purpose}</td>
                    <td>{entry.fuel_used_liters ? `${entry.fuel_used_liters} L` : '-'}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DriverLogbook;
