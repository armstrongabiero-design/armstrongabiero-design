import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, RotateCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const POSITIONS = [
  { value: 'FRONT_LEFT', label: 'Front Left (FL)' },
  { value: 'FRONT_RIGHT', label: 'Front Right (FR)' },
  { value: 'REAR_LEFT', label: 'Rear Left (RL)' },
  { value: 'REAR_RIGHT', label: 'Rear Right (RR)' },
  { value: 'SPARE', label: 'Spare' },
];

const TireManagement = () => {
  const [tires, setTires] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rotationDialogOpen, setRotationDialogOpen] = useState(false);
  const [selectedVehicle, setSelectedVehicle] = useState(null);

  const [formData, setFormData] = useState({
    serial_number: '',
    brand: '',
    model: '',
    size: '',
    vehicle_id: '',
    position: '',
    country: 'GHANA',
    purchase_date: new Date().toISOString().split('T')[0],
    purchase_cost: '',
    currency: 'GHS',
    tread_depth_mm: '',
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [tiresRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/tires`),
        axios.get(`${API}/vehicles`),
      ]);
      setTires(tiresRes.data);
      setVehicles(vehiclesRes.data);
    } catch (error) {
      toast.error('Failed to load tire data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/tires`, {
        ...formData,
        purchase_date: new Date(formData.purchase_date).toISOString(),
        purchase_cost: parseFloat(formData.purchase_cost),
        tread_depth_mm: formData.tread_depth_mm ? parseFloat(formData.tread_depth_mm) : null,
        mileage_at_install: formData.vehicle_id ? 0 : null,
      });
      toast.success('Tire added successfully!');
      setDialogOpen(false);
      fetchData();
      setFormData({
        serial_number: '',
        brand: '',
        model: '',
        size: '',
        vehicle_id: '',
        position: '',
        country: 'GHANA',
        purchase_date: new Date().toISOString().split('T')[0],
        purchase_cost: '',
        currency: 'GHS',
        tread_depth_mm: '',
        notes: '',
      });
    } catch (error) {
      toast.error('Failed to add tire');
    }
  };

  const getTreadStatus = (tire) => {
    if (!tire.tread_depth_mm) return { status: 'unknown', color: 'slate' };
    if (tire.tread_depth_mm <= tire.min_tread_depth) return { status: 'Replace', color: 'red' };
    if (tire.tread_depth_mm <= tire.min_tread_depth + 1) return { status: 'Warning', color: 'amber' };
    return { status: 'Good', color: 'green' };
  };

  const getRotationStatus = (tire) => {
    if (!tire.next_rotation_due) return null;
    const dueDate = new Date(tire.next_rotation_due);
    const now = new Date();
    const daysUntil = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));
    if (daysUntil < 0) return { status: 'Overdue', color: 'red', days: Math.abs(daysUntil) };
    if (daysUntil <= 7) return { status: 'Due Soon', color: 'amber', days: daysUntil };
    return { status: 'OK', color: 'green', days: daysUntil };
  };

  const groupedByVehicle = vehicles.map(v => ({
    ...v,
    tires: tires.filter(t => t.vehicle_id === v.id && t.status === 'IN_USE'),
  }));

  const spareTires = tires.filter(t => t.status === 'SPARE' || !t.vehicle_id);

  return (
    <div className="p-6 lg:p-8" data-testid="tire-management-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Tire Management</h1>
          <p className="text-slate-600 mt-1">Track tire lifecycle, rotations, and replacements</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-tire-btn">
                <Plus size={18} className="mr-2" />
                Add Tire
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Tire</DialogTitle>
                <DialogDescription>Register a new tire with serial number tracking.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Serial Number *</Label>
                    <Input value={formData.serial_number} onChange={(e) => setFormData({...formData, serial_number: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Size *</Label>
                    <Input value={formData.size} onChange={(e) => setFormData({...formData, size: e.target.value})} placeholder="265/70R17" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Brand *</Label>
                    <Input value={formData.brand} onChange={(e) => setFormData({...formData, brand: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Model</Label>
                    <Input value={formData.model} onChange={(e) => setFormData({...formData, model: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Vehicle (optional)</Label>
                    <Select value={formData.vehicle_id} onValueChange={(value) => setFormData({...formData, vehicle_id: value})}>
                      <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">None (Spare)</SelectItem>
                        {vehicles.map(v => (
                          <SelectItem key={v.id} value={v.id}>{v.registration_number}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Position</Label>
                    <Select value={formData.position} onValueChange={(value) => setFormData({...formData, position: value})}>
                      <SelectTrigger><SelectValue placeholder="Select position" /></SelectTrigger>
                      <SelectContent>
                        {POSITIONS.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Purchase Date *</Label>
                    <Input type="date" value={formData.purchase_date} onChange={(e) => setFormData({...formData, purchase_date: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Tread Depth (mm)</Label>
                    <Input type="number" step="0.1" value={formData.tread_depth_mm} onChange={(e) => setFormData({...formData, tread_depth_mm: e.target.value})} placeholder="8.0" />
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Cost *</Label>
                    <Input type="number" value={formData.purchase_cost} onChange={(e) => setFormData({...formData, purchase_cost: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Select value={formData.currency} onValueChange={(value) => setFormData({...formData, currency: value})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHS">GHS</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="LRD">LRD</SelectItem>
                        <SelectItem value="STN">STN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHANA">Ghana</SelectItem>
                        <SelectItem value="LIBERIA">Liberia</SelectItem>
                        <SelectItem value="SAO_TOME">São Tomé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Add Tire</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Total Tires</p>
          <p className="text-2xl font-bold text-slate-800">{tires.length}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">In Use</p>
          <p className="text-2xl font-bold text-green-600">{tires.filter(t => t.status === 'IN_USE').length}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Spare Tires</p>
          <p className="text-2xl font-bold text-blue-600">{spareTires.length}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Need Replacement</p>
          <p className="text-2xl font-bold text-red-600">
            {tires.filter(t => t.tread_depth_mm && t.tread_depth_mm <= t.min_tread_depth).length}
          </p>
        </div>
      </div>

      {/* Tires by Vehicle */}
      <Tabs defaultValue="by-vehicle">
        <TabsList>
          <TabsTrigger value="by-vehicle">By Vehicle</TabsTrigger>
          <TabsTrigger value="all-tires">All Tires</TabsTrigger>
          <TabsTrigger value="spare">Spare Tires</TabsTrigger>
        </TabsList>

        <TabsContent value="by-vehicle" className="mt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {groupedByVehicle.map(vehicle => (
              <div key={vehicle.id} className="fleet-card">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-semibold text-lg">{vehicle.registration_number}</h3>
                    <p className="text-sm text-slate-500">{vehicle.make} {vehicle.model}</p>
                  </div>
                  <span className="country-badge ghana">{vehicle.country}</span>
                </div>
                
                {/* Tire Diagram */}
                <div className="grid grid-cols-2 gap-4 mt-4">
                  {['FRONT_LEFT', 'FRONT_RIGHT', 'REAR_LEFT', 'REAR_RIGHT'].map(pos => {
                    const tire = vehicle.tires.find(t => t.position === pos);
                    const treadStatus = tire ? getTreadStatus(tire) : null;
                    const rotationStatus = tire ? getRotationStatus(tire) : null;
                    
                    return (
                      <div key={pos} className={`p-3 rounded-lg border-2 ${tire ? `border-${treadStatus?.color}-200 bg-${treadStatus?.color}-50` : 'border-slate-200 bg-slate-50'}`}>
                        <p className="text-xs text-slate-500 mb-1">{POSITIONS.find(p => p.value === pos)?.label}</p>
                        {tire ? (
                          <>
                            <p className="font-mono text-sm font-semibold">{tire.serial_number}</p>
                            <p className="text-xs text-slate-600">{tire.brand} {tire.size}</p>
                            {tire.tread_depth_mm && (
                              <p className={`text-xs text-${treadStatus?.color}-600`}>
                                Tread: {tire.tread_depth_mm}mm
                              </p>
                            )}
                            {rotationStatus && rotationStatus.status !== 'OK' && (
                              <p className={`text-xs text-${rotationStatus.color}-600 flex items-center gap-1`}>
                                <RotateCw size={10} /> Rotation {rotationStatus.status}
                              </p>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-slate-400">No tire assigned</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="all-tires" className="mt-4">
          <div className="fleet-card table-container">
            <table>
              <thead>
                <tr>
                  <th>Serial #</th>
                  <th>Brand/Model</th>
                  <th>Size</th>
                  <th>Vehicle</th>
                  <th>Position</th>
                  <th>Tread</th>
                  <th>Status</th>
                  <th>Country</th>
                </tr>
              </thead>
              <tbody>
                {tires.map(tire => {
                  const vehicle = vehicles.find(v => v.id === tire.vehicle_id);
                  const treadStatus = getTreadStatus(tire);
                  return (
                    <tr key={tire.id}>
                      <td className="font-mono font-semibold">{tire.serial_number}</td>
                      <td>{tire.brand} {tire.model}</td>
                      <td>{tire.size}</td>
                      <td>{vehicle?.registration_number || '-'}</td>
                      <td>{POSITIONS.find(p => p.value === tire.position)?.label || '-'}</td>
                      <td>
                        {tire.tread_depth_mm ? (
                          <span className={`text-${treadStatus.color}-600 font-semibold`}>
                            {tire.tread_depth_mm}mm
                          </span>
                        ) : '-'}
                      </td>
                      <td>
                        <span className={`status-badge bg-${tire.status === 'IN_USE' ? 'green' : tire.status === 'SPARE' ? 'blue' : 'slate'}-100 text-${tire.status === 'IN_USE' ? 'green' : tire.status === 'SPARE' ? 'blue' : 'slate'}-800`}>
                          {tire.status}
                        </span>
                      </td>
                      <td><span className="country-badge ghana">{tire.country}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="spare" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {spareTires.map(tire => (
              <div key={tire.id} className="fleet-card">
                <h4 className="font-mono font-semibold text-lg">{tire.serial_number}</h4>
                <p className="text-slate-600">{tire.brand} {tire.model}</p>
                <p className="text-sm text-slate-500">{tire.size}</p>
                <div className="flex justify-between mt-2">
                  <span className="country-badge ghana">{tire.country}</span>
                  <span className="text-sm text-slate-500">
                    {tire.tread_depth_mm ? `${tire.tread_depth_mm}mm tread` : 'New'}
                  </span>
                </div>
              </div>
            ))}
            {spareTires.length === 0 && (
              <p className="col-span-full text-center text-slate-500 py-8">No spare tires in inventory</p>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default TireManagement;
