import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Search } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Drivers = () => {
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    country: 'GHANA',
    first_name: '',
    last_name: '',
    license_number: '',
    license_expiry: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
    phone: '',
    email: '',
  });

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const response = await axios.get(`${API}/drivers`);
      setDrivers(response.data);
    } catch (error) {
      toast.error('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/drivers`, {
        ...formData,
        license_expiry: new Date(formData.license_expiry).toISOString(),
      });
      toast.success('Driver added successfully!');
      setDialogOpen(false);
      fetchDrivers();
    } catch (error) {
      toast.error('Failed to add driver');
    }
  };

  return (
    <div className="p-6 lg:p-8" data-testid="drivers-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Drivers</h1>
          <p className="text-slate-600 mt-1">Manage driver profiles and safety scores</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-driver-btn">
              <Plus size={18} className="mr-2" />
              Add Driver
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Driver</DialogTitle>
              <DialogDescription>Register a new driver with their license and contact details.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Country</Label>
                <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="GHANA">Ghana</SelectItem>
                    <SelectItem value="LIBERIA">Liberia</SelectItem>
                    <SelectItem value="SAO_TOME">São Tomé</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Name</Label>
                  <Input value={formData.first_name} onChange={(e) => setFormData({...formData, first_name: e.target.value})} required />
                </div>
                <div>
                  <Label>Last Name</Label>
                  <Input value={formData.last_name} onChange={(e) => setFormData({...formData, last_name: e.target.value})} required />
                </div>
              </div>
              <div>
                <Label>License Number</Label>
                <Input value={formData.license_number} onChange={(e) => setFormData({...formData, license_number: e.target.value})} required />
              </div>
              <div>
                <Label>License Expiry</Label>
                <Input type="date" value={formData.license_expiry} onChange={(e) => setFormData({...formData, license_expiry: e.target.value})} required />
              </div>
              <div>
                <Label>Phone</Label>
                <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required />
              </div>
              <div>
                <Label>Email</Label>
                <Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit">Add Driver</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>License</th>
              <th>Country</th>
              <th>Phone</th>
              <th>Safety Score</th>
              <th>Incidents</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td colSpan="7" className="text-center py-8 text-slate-500">No drivers found</td>
              </tr>
            ) : (
              drivers.map((driver) => (
                <tr key={driver.id}>
                  <td className="font-semibold">{driver.first_name} {driver.last_name}</td>
                  <td className="text-xs">{driver.license_number}</td>
                  <td><span className="country-badge ghana">{driver.country.replace('_', ' ')}</span></td>
                  <td>{driver.phone}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div className="bg-green-500 h-2 rounded-full" style={{width: `${driver.safety_score}%`}}></div>
                      </div>
                      <span className="text-sm font-semibold">{driver.safety_score}</span>
                    </div>
                  </td>
                  <td>{driver.total_incidents}</td>
                  <td><span className="status-badge active">{driver.status}</span></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Drivers;
