import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Book, AlertTriangle, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DriverLogbook = () => {
  const [entries, setEntries] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState('');
  const [driverSummary, setDriverSummary] = useState(null);

  const [formData, setFormData] = useState({
    driver_id: '',
    vehicle_id: '',
    country: 'GHANA',
    date: new Date().toISOString().split('T')[0],
    start_time: '',
    end_time: '',
    start_location: '',
    end_location: '',
    start_odometer: '',
    end_odometer: '',
    purpose: '',
    fuel_used_liters: '',
    average_speed_kmh: '',
    max_speed_kmh: '',
    speed_limit_violations: 0,
    harsh_braking_events: 0,
    harsh_acceleration_events: 0,
    idle_time_minutes: 0,
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedDriver) {
      fetchDriverSummary(selectedDriver);
    }
  }, [selectedDriver]);

  const fetchData = async () => {
    try {
      const [entriesRes, driversRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/logbook`),
        axios.get(`${API}/drivers`),
        axios.get(`${API}/vehicles`),
      ]);
      setEntries(entriesRes.data);
      setDrivers(driversRes.data);
      setVehicles(vehiclesRes.data);
    } catch (error) {
      toast.error('Failed to load logbook data');
    } finally {
      setLoading(false);
    }
  };

  const fetchDriverSummary = async (driverId) => {
    try {
      const response = await axios.get(`${API}/logbook/summary/${driverId}`);
      setDriverSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch driver summary');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const driver = drivers.find(d => d.id === formData.driver_id);
    
    try {
      await axios.post(`${API}/logbook`, {
        ...formData,
        country: driver?.country || formData.country,
        date: new Date(formData.date).toISOString(),
        start_time: new Date(`${formData.date}T${formData.start_time}`).toISOString(),
        end_time: formData.end_time ? new Date(`${formData.date}T${formData.end_time}`).toISOString() : null,
        start_odometer: parseFloat(formData.start_odometer),
        end_odometer: formData.end_odometer ? parseFloat(formData.end_odometer) : null,
        fuel_used_liters: formData.fuel_used_liters ? parseFloat(formData.fuel_used_liters) : null,
        average_speed_kmh: formData.average_speed_kmh ? parseFloat(formData.average_speed_kmh) : null,
        max_speed_kmh: formData.max_speed_kmh ? parseFloat(formData.max_speed_kmh) : null,
        speed_limit_violations: parseInt(formData.speed_limit_violations) || 0,
        harsh_braking_events: parseInt(formData.harsh_braking_events) || 0,
        harsh_acceleration_events: parseInt(formData.harsh_acceleration_events) || 0,
        idle_time_minutes: parseInt(formData.idle_time_minutes) || 0,
      });
      toast.success('Logbook entry added!');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to add logbook entry');
    }
  };

  const filteredEntries = selectedDriver
    ? entries.filter(e => e.driver_id === selectedDriver)
    : entries;

  return (
    <div className="p-6 lg:p-8" data-testid="driver-logbook-page">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Driver Logbook</h1>
          <p className="text-slate-600 mt-1">Digital trip logs and driver performance tracking</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedDriver} onValueChange={setSelectedDriver}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="All Drivers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Drivers</SelectItem>
              {drivers.map(d => (
                <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                <DialogDescription>Record a trip or driving session.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                    <Input type="number" value={formData.start_odometer} onChange={(e) => setFormData({...formData, start_odometer: e.target.value})} required />
                  </div>
                  <div>
                    <Label>End Odometer (km)</Label>
                    <Input type="number" value={formData.end_odometer} onChange={(e) => setFormData({...formData, end_odometer: e.target.value})} />
                  </div>
                </div>

                <div>
                  <Label>Purpose *</Label>
                  <Input value={formData.purpose} onChange={(e) => setFormData({...formData, purpose: e.target.value})} placeholder="e.g., Delivery, Site Visit, Client Meeting" required />
                </div>

                <div className="border-t pt-4 mt-4">
                  <h4 className="font-semibold text-slate-800 mb-3">Driving Metrics (from GPS/Telematics)</h4>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <Label>Fuel Used (L)</Label>
                      <Input type="number" step="0.1" value={formData.fuel_used_liters} onChange={(e) => setFormData({...formData, fuel_used_liters: e.target.value})} />
                    </div>
                    <div>
                      <Label>Avg Speed (km/h)</Label>
                      <Input type="number" value={formData.average_speed_kmh} onChange={(e) => setFormData({...formData, average_speed_kmh: e.target.value})} />
                    </div>
                    <div>
                      <Label>Max Speed (km/h)</Label>
                      <Input type="number" value={formData.max_speed_kmh} onChange={(e) => setFormData({...formData, max_speed_kmh: e.target.value})} />
                    </div>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h4 className="font-semibold text-slate-800 mb-3">Safety Events</h4>
                  <div className="grid grid-cols-4 gap-4">
                    <div>
                      <Label>Speed Violations</Label>
                      <Input type="number" value={formData.speed_limit_violations} onChange={(e) => setFormData({...formData, speed_limit_violations: e.target.value})} />
                    </div>
                    <div>
                      <Label>Harsh Braking</Label>
                      <Input type="number" value={formData.harsh_braking_events} onChange={(e) => setFormData({...formData, harsh_braking_events: e.target.value})} />
                    </div>
                    <div>
                      <Label>Harsh Accel.</Label>
                      <Input type="number" value={formData.harsh_acceleration_events} onChange={(e) => setFormData({...formData, harsh_acceleration_events: e.target.value})} />
                    </div>
                    <div>
                      <Label>Idle Time (min)</Label>
                      <Input type="number" value={formData.idle_time_minutes} onChange={(e) => setFormData({...formData, idle_time_minutes: e.target.value})} />
                    </div>
                  </div>
                </div>

                <div>
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} placeholder="Additional notes..." />
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

      {/* Driver Summary Card */}
      {selectedDriver && driverSummary && (
        <div className="fleet-card mb-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">
            {drivers.find(d => d.id === selectedDriver)?.first_name}'s 30-Day Summary
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div>
              <p className="text-sm text-slate-500">Total Trips</p>
              <p className="text-2xl font-bold text-slate-800">{driverSummary.total_trips}</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Distance</p>
              <p className="text-2xl font-bold text-slate-800">{driverSummary.total_distance_km.toLocaleString()} km</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Fuel Used</p>
              <p className="text-2xl font-bold text-slate-800">{driverSummary.total_fuel_liters} L</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Fuel Efficiency</p>
              <p className="text-2xl font-bold text-green-600">{driverSummary.avg_fuel_efficiency} km/L</p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Speed Violations</p>
              <p className={`text-2xl font-bold ${driverSummary.speed_violations > 0 ? 'text-red-600' : 'text-green-600'}`}>
                {driverSummary.speed_violations}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Harsh Events</p>
              <p className={`text-2xl font-bold ${(driverSummary.harsh_braking_events + driverSummary.harsh_acceleration_events) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                {driverSummary.harsh_braking_events + driverSummary.harsh_acceleration_events}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Logbook Entries Table */}
      <div className="fleet-card">
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Route</th>
                <th>Distance</th>
                <th>Purpose</th>
                <th>Max Speed</th>
                <th>Violations</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center py-8 text-slate-500">No logbook entries found</td>
                </tr>
              ) : (
                filteredEntries.slice(0, 50).map(entry => {
                  const driver = drivers.find(d => d.id === entry.driver_id);
                  const vehicle = vehicles.find(v => v.id === entry.vehicle_id);
                  const distance = entry.distance_km || (entry.end_odometer ? entry.end_odometer - entry.start_odometer : null);
                  
                  return (
                    <tr key={entry.id}>
                      <td>{new Date(entry.date).toLocaleDateString()}</td>
                      <td className="font-semibold">{driver?.first_name} {driver?.last_name}</td>
                      <td>{vehicle?.registration_number}</td>
                      <td>
                        <div className="text-sm">
                          <div>{entry.start_location}</div>
                          {entry.end_location && <div className="text-slate-500">→ {entry.end_location}</div>}
                        </div>
                      </td>
                      <td>{distance ? `${distance.toFixed(1)} km` : '-'}</td>
                      <td className="max-w-xs truncate">{entry.purpose}</td>
                      <td>
                        {entry.max_speed_kmh && (
                          <span className={entry.max_speed_kmh > 100 ? 'text-red-600 font-semibold' : ''}>
                            {entry.max_speed_kmh} km/h
                          </span>
                        )}
                      </td>
                      <td>
                        {entry.speed_limit_violations > 0 ? (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertTriangle size={14} />
                            {entry.speed_limit_violations}
                          </span>
                        ) : (
                          <span className="text-green-600">✓</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default DriverLogbook;
