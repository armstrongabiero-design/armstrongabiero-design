import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, AlertCircle, Droplet, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Link } from 'react-router-dom';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Fuel = () => {
  const [transactions, setTransactions] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checklistStatus, setChecklistStatus] = useState(null);

  const [formData, setFormData] = useState({
    vehicle_id: '',
    driver_id: '',
    date: new Date().toISOString().split('T')[0],
    quantity_liters: 0,
    cost: 0,
    currency: 'GHS',
    odometer_reading: 0,
    location: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  // Check pre-trip checklist status when vehicle and driver change
  useEffect(() => {
    if (formData.vehicle_id && formData.driver_id) {
      checkPreTripStatus();
    }
  }, [formData.vehicle_id, formData.driver_id]);

  const fetchData = async () => {
    try {
      const [fuelRes, vehiclesRes, driversRes] = await Promise.all([
        axios.get(`${API}/fuel`),
        axios.get(`${API}/vehicles`),
        axios.get(`${API}/drivers`),
      ]);
      setTransactions(fuelRes.data);
      setVehicles(vehiclesRes.data);
      setDrivers(driversRes.data);
    } catch (error) {
      toast.error('Failed to load fuel data');
    } finally {
      setLoading(false);
    }
  };

  const checkPreTripStatus = async () => {
    try {
      const response = await axios.get(`${API}/pre-trip-checklists/today/${formData.driver_id}/${formData.vehicle_id}`);
      setChecklistStatus(response.data);
    } catch (error) {
      setChecklistStatus(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Check if pre-trip checklist is completed
    if (!checklistStatus?.can_log_trips) {
      toast.error('Please complete the pre-trip checklist before logging fuel');
      return;
    }
    
    try {
      await axios.post(`${API}/fuel`, {
        ...formData,
        date: new Date(formData.date).toISOString(),
        quantity_liters: parseFloat(formData.quantity_liters),
        cost: parseFloat(formData.cost),
        odometer_reading: parseFloat(formData.odometer_reading),
      });
      toast.success('Fuel transaction recorded!');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to record transaction');
    }
  };

  const anomalies = transactions.filter(t => t.anomaly_detected);

  return (
    <div className="p-6 lg:p-8" data-testid="fuel-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Fuel Management</h1>
          <p className="text-slate-600 mt-1">Track fuel consumption and detect anomalies</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-fuel-btn">
              <Plus size={18} className="mr-2" />
              Add Transaction
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Fuel Transaction</DialogTitle>
              <DialogDescription>Log a fuel purchase to track consumption and detect anomalies.</DialogDescription>
            </DialogHeader>
            
            {/* Pre-trip checklist warning */}
            {formData.vehicle_id && formData.driver_id && !checklistStatus?.can_log_trips && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="text-amber-600 mt-0.5" size={18} />
                  <div>
                    <p className="font-semibold text-amber-800 text-sm">Pre-Trip Checklist Required</p>
                    <p className="text-xs text-amber-700">Complete the checklist before logging fuel.</p>
                    <Link to="/pre-trip-checklist" className="text-xs text-amber-600 underline mt-1 inline-block">
                      Go to Pre-Trip Checklist →
                    </Link>
                  </div>
                </div>
              </div>
            )}
            
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
                <Label>Date</Label>
                <Input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Quantity (liters)</Label>
                  <Input type="number" step="0.01" value={formData.quantity_liters} onChange={(e) => setFormData({...formData, quantity_liters: e.target.value})} required />
                </div>
                <div>
                  <Label>Odometer Reading</Label>
                  <Input type="number" value={formData.odometer_reading} onChange={(e) => setFormData({...formData, odometer_reading: e.target.value})} required />
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
              <div>
                <Label>Location</Label>
                <Input value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} required />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit">Record Transaction</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {anomalies.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertCircle className="text-red-600" size={20} />
          <div>
            <p className="font-semibold text-red-800">Anomalies Detected</p>
            <p className="text-sm text-red-700">{anomalies.length} fuel transactions flagged for review</p>
          </div>
        </div>
      )}

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Vehicle</th>
              <th>Driver</th>
              <th>Quantity (L)</th>
              <th>Cost (USD)</th>
              <th>Efficiency</th>
              <th>Location</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center py-8 text-slate-500">No fuel transactions</td>
              </tr>
            ) : (
              transactions.map((txn) => {
                const vehicle = vehicles.find(v => v.id === txn.vehicle_id);
                const driver = drivers.find(d => d.id === txn.driver_id);
                return (
                  <tr key={txn.id} className={txn.anomaly_detected ? 'bg-red-50' : ''}>
                    <td>{new Date(txn.date).toLocaleDateString()}</td>
                    <td className="font-semibold">{vehicle?.registration_number || 'N/A'}</td>
                    <td>{driver?.first_name} {driver?.last_name}</td>
                    <td>{txn.quantity_liters} L</td>
                    <td>${txn.cost_usd.toLocaleString()}</td>
                    <td>{txn.fuel_efficiency ? `${txn.fuel_efficiency} km/L` : '-'}</td>
                    <td className="text-sm">{txn.location}</td>
                    <td>
                      {txn.anomaly_detected ? (
                        <span className="status-badge maintenance">
                          <AlertCircle size={12} className="mr-1" />
                          Anomaly
                        </span>
                      ) : (
                        <span className="status-badge active">Normal</span>
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
  );
};

export default Fuel;
