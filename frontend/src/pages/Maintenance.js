import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Maintenance = () => {
  const [records, setRecords] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState('');

  const [formData, setFormData] = useState({
    vehicle_id: '',
    maintenance_type: 'SCHEDULED',
    description: '',
    scheduled_date: new Date().toISOString().split('T')[0],
    odometer_at_maintenance: 0,
    cost: 0,
    currency: 'GHS',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [recordsRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/maintenance`),
        axios.get(`${API}/vehicles`),
      ]);
      setRecords(recordsRes.data);
      setVehicles(vehiclesRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/maintenance`, {
        ...formData,
        scheduled_date: new Date(formData.scheduled_date).toISOString(),
        odometer_at_maintenance: parseFloat(formData.odometer_at_maintenance),
        cost: parseFloat(formData.cost),
      });
      toast.success('Maintenance record added!');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to add maintenance record');
    }
  };

  const predictMaintenance = async () => {
    if (!selectedVehicle) {
      toast.error('Please select a vehicle');
      return;
    }
    setPredicting(true);
    try {
      const response = await axios.post(`${API}/maintenance/predict/${selectedVehicle}`);
      toast.success(
        <div>
          <p className="font-semibold">AI Prediction Complete</p>
          <p className="text-sm mt-1">Priority: {response.data.priority}</p>
          <p className="text-xs mt-1">{response.data.predicted_issues?.join(', ')}</p>
        </div>
      );
    } catch (error) {
      toast.error('Prediction failed');
    } finally {
      setPredicting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8" data-testid="maintenance-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Maintenance</h1>
          <p className="text-slate-600 mt-1">Track and predict vehicle maintenance</p>
        </div>
        <div className="flex gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="ai-predict-btn">
                <Sparkles size={18} className="mr-2" />
                AI Predict
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>AI Maintenance Prediction</DialogTitle>
                <DialogDescription>Select a vehicle to analyze its maintenance needs using AI.</DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Select Vehicle</Label>
                  <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.registration_number} - {v.make} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={predictMaintenance} disabled={predicting} className="w-full">
                  {predicting ? 'Analyzing...' : 'Predict Maintenance Needs'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-maintenance-btn">
                <Plus size={18} className="mr-2" />
                Add Record
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Maintenance Record</DialogTitle>
                <DialogDescription>Record a new maintenance entry for a vehicle.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Vehicle</Label>
                  <Select value={formData.vehicle_id} onValueChange={(value) => setFormData({...formData, vehicle_id: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select vehicle" />
                    </SelectTrigger>
                    <SelectContent>
                      {vehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.registration_number} - {v.make} {v.model}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Type</Label>
                  <Select value={formData.maintenance_type} onValueChange={(value) => setFormData({...formData, maintenance_type: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                      <SelectItem value="UNSCHEDULED">Unscheduled</SelectItem>
                      <SelectItem value="PREDICTIVE">Predictive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Scheduled Date</Label>
                    <Input type="date" value={formData.scheduled_date} onChange={(e) => setFormData({...formData, scheduled_date: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Odometer</Label>
                    <Input type="number" value={formData.odometer_at_maintenance} onChange={(e) => setFormData({...formData, odometer_at_maintenance: e.target.value})} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Cost</Label>
                    <Input type="number" step="0.01" value={formData.cost} onChange={(e) => setFormData({...formData, cost: e.target.value})} required />
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
                  <Button type="submit">Add Record</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Type</th>
              <th>Description</th>
              <th>Scheduled Date</th>
              <th>Odometer</th>
              <th>Cost (USD)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {records.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-8 text-slate-500">No maintenance records</td>
              </tr>
            ) : (
              records.map((record) => {
                const vehicle = vehicles.find(v => v.id === record.vehicle_id);
                return (
                  <tr key={record.id}>
                    <td className="font-semibold">{vehicle?.registration_number || 'N/A'}</td>
                    <td><span className="status-badge">{record.maintenance_type}</span></td>
                    <td className="text-sm">{record.description}</td>
                    <td>{new Date(record.scheduled_date).toLocaleDateString()}</td>
                    <td>{record.odometer_at_maintenance.toLocaleString()} km</td>
                    <td>${record.cost_usd.toLocaleString()}</td>
                    <td>
                      <span className={record.completed_date ? 'status-badge active' : 'status-badge maintenance'}>
                        {record.completed_date ? 'Completed' : 'Pending'}
                      </span>
                    </td>
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

export default Maintenance;
