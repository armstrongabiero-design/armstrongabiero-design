import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Safety = () => {
  const [incidents, setIncidents] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    driver_id: '',
    vehicle_id: '',
    incident_date: new Date().toISOString().split('T')[0],
    incident_type: '',
    severity: 'MEDIUM',
    description: '',
    location: '',
    cost: 0,
    currency: 'GHS',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [incidentsRes, driversRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/safety/incidents`),
        axios.get(`${API}/drivers`),
        axios.get(`${API}/vehicles`),
      ]);
      setIncidents(incidentsRes.data);
      setDrivers(driversRes.data);
      setVehicles(vehiclesRes.data);
    } catch (error) {
      toast.error('Failed to load safety data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/safety/incidents`, {
        ...formData,
        incident_date: new Date(formData.incident_date).toISOString(),
        cost: formData.cost ? parseFloat(formData.cost) : null,
      });
      toast.success('Incident recorded. Driver safety score updated.');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to record incident');
    }
  };

  const getSeverityBadge = (severity) => {
    const badges = {
      LOW: 'bg-green-100 text-green-800',
      MEDIUM: 'bg-amber-100 text-amber-800',
      HIGH: 'bg-red-100 text-red-800',
    };
    return `status-badge ${badges[severity] || ''}`;
  };

  return (
    <div className="p-6 lg:p-8" data-testid="safety-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Safety Management</h1>
          <p className="text-slate-600 mt-1">Track incidents and driver safety scores</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-incident-btn">
              <Plus size={18} className="mr-2" />
              Report Incident
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Report Safety Incident</DialogTitle>
              <DialogDescription>Document a safety incident to update driver scores and records.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Driver</Label>
                  <Select value={formData.driver_id} onValueChange={(value) => setFormData({...formData, driver_id: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select driver" />
                    </SelectTrigger>
                    <SelectContent>
                      {drivers.map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.first_name} {d.last_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Vehicle</Label>
                  <Select value={formData.vehicle_id} onValueChange={(value) => setFormData({...formData, vehicle_id: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.registration_number}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Incident Date</Label>
                <Input type="date" value={formData.incident_date} onChange={(e) => setFormData({...formData, incident_date: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Incident Type</Label>
                  <Input value={formData.incident_type} onChange={(e) => setFormData({...formData, incident_type: e.target.value})} placeholder="e.g., Collision, Speeding" required />
                </div>
                <div>
                  <Label>Severity</Label>
                  <Select value={formData.severity} onValueChange={(value) => setFormData({...formData, severity: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cost (optional)</Label>
                  <Input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({...formData, cost: e.target.value})} />
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={formData.currency} onValueChange={(value) => setFormData({...formData, currency: value})}>
                    <SelectTrigger>
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
                <Button type="submit">Report Incident</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Driver Safety Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {drivers.slice(0, 3).map(driver => (
          <div key={driver.id} className="fleet-card">
            <div className="flex justify-between items-start mb-3">
              <div>
                <h3 className="font-semibold text-slate-800">{driver.first_name} {driver.last_name}</h3>
                <p className="text-xs text-slate-500">{driver.license_number}</p>
              </div>
              <span className="text-2xl font-bold text-amber-600">{driver.safety_score}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${driver.safety_score >= 80 ? 'bg-green-500' : driver.safety_score >= 60 ? 'bg-amber-500' : 'bg-red-500'}`}
                style={{width: `${driver.safety_score}%`}}
              ></div>
            </div>
            <p className="text-xs text-slate-600 mt-2">{driver.total_incidents} incidents</p>
          </div>
        ))}
      </div>

      {/* Incidents Table */}
      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Driver</th>
              <th>Vehicle</th>
              <th>Type</th>
              <th>Severity</th>
              <th>Location</th>
              <th>Cost (USD)</th>
            </tr>
          </thead>
          <tbody>
            {incidents.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-8 text-slate-500">No safety incidents recorded</td>
              </tr>
            ) : (
              incidents.map((incident) => {
                const driver = drivers.find(d => d.id === incident.driver_id);
                const vehicle = vehicles.find(v => v.id === incident.vehicle_id);
                return (
                  <tr key={incident.id}>
                    <td>{new Date(incident.incident_date).toLocaleDateString()}</td>
                    <td className="font-semibold">{driver?.first_name} {driver?.last_name}</td>
                    <td>{vehicle?.registration_number}</td>
                    <td>{incident.incident_type}</td>
                    <td>
                      <span className={getSeverityBadge(incident.severity)}>
                        {incident.severity === 'HIGH' && <AlertTriangle size={12} className="inline mr-1" />}
                        {incident.severity}
                      </span>
                    </td>
                    <td className="text-sm">{incident.location}</td>
                    <td>{incident.cost_usd ? `$${incident.cost_usd.toLocaleString()}` : '-'}</td>
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

export default Safety;
