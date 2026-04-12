import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { ClipboardCheck, Camera, AlertTriangle, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
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

const CHECKLIST_ITEMS = [
  { key: 'engine_oil', label: 'Engine Oil Level', icon: '🛢️' },
  { key: 'tires', label: 'Tire Condition & Pressure', icon: '🛞' },
  { key: 'brakes', label: 'Brake Functionality', icon: '🛑' },
  { key: 'lights', label: 'Lights (Headlights, Indicators, Brake)', icon: '💡' },
  { key: 'fuel_level', label: 'Fuel Level', icon: '⛽' },
  { key: 'mirrors_wipers', label: 'Mirrors & Wipers', icon: '🪞' },
  { key: 'cleanliness_damage', label: 'Cleanliness & Damage Check', icon: '🚗' },
];

const PreTripChecklist = () => {
  const { user, token, isDriverOrUser } = useAuth();
  const isPersonalView = isDriverOrUser && isDriverOrUser();
  
  const [checklists, setChecklists] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checklistStatus, setChecklistStatus] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // For personal view, auto-set driver
  const [selectedDriver, setSelectedDriver] = useState(isPersonalView ? (user?.driver_id || user?.id) : '');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  
  const [formData, setFormData] = useState({
    driver_id: isPersonalView ? (user?.driver_id || user?.id) : '',
    vehicle_id: '',
    engine_oil: 'OK',
    engine_oil_notes: '',
    tires: 'OK',
    tires_notes: '',
    brakes: 'OK',
    brakes_notes: '',
    lights: 'OK',
    lights_notes: '',
    fuel_level: 'OK',
    fuel_level_notes: '',
    mirrors_wipers: 'OK',
    mirrors_wipers_notes: '',
    cleanliness_damage: 'OK',
    cleanliness_damage_notes: '',
    damage_photos: [],
    additional_notes: '',
  });

  const fetchData = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const [checklistsRes, driversRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/pre-trip-checklists`, { headers }),
        axios.get(`${API}/drivers`, { headers }),
        axios.get(`${API}/vehicles`, { headers }),
      ]);
      
      let filteredChecklists = checklistsRes.data;
      if (isPersonalView) {
        const userId = user?.driver_id || user?.id;
        filteredChecklists = checklistsRes.data.filter(c => c.driver_id === userId);
      }
      
      setChecklists(filteredChecklists);
      setDrivers(driversRes.data);
      setVehicles(vehiclesRes.data);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, isPersonalView, user]);

  const checkTodayStatus = useCallback(async (driverId, vehicleId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`${API}/pre-trip-checklists/today/${driverId}/${vehicleId}`, { headers });
      if (response.data.completed) {
        setChecklistStatus(response.data);
      } else {
        setChecklistStatus(null);
      }
    } catch {
      setChecklistStatus(null);
    }
  }, [token]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const driverId = isPersonalView ? (user?.driver_id || user?.id) : selectedDriver;
    if (driverId && selectedVehicle) {
      checkTodayStatus(driverId, selectedVehicle);
    }
  }, [selectedDriver, selectedVehicle, isPersonalView, user, checkTodayStatus]);

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPhoto(true);
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.post(`${API}/pre-trip-checklists/upload-photo`, formDataUpload, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' }
      });
      setFormData({
        ...formData,
        damage_photos: [...formData.damage_photos, response.data.url]
      });
      toast.success('Photo uploaded');
    } catch (error) {
      toast.error('Failed to upload photo');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const driverId = isPersonalView ? (user?.driver_id || user?.id) : formData.driver_id;
    
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/pre-trip-checklists`, {
        ...formData,
        driver_id: driverId,
      }, { headers });
      toast.success('Pre-trip checklist completed! You can now log trips and fuel.');
      setDialogOpen(false);
      fetchData();
      const vehicleId = formData.vehicle_id;
      if (driverId && vehicleId) {
        checkTodayStatus(driverId, vehicleId);
      }
    } catch (error) {
      if (error.response?.data?.detail) {
        toast.error(error.response.data.detail);
      } else {
        toast.error('Failed to submit checklist');
      }
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'OK':
        return <CheckCircle2 className="text-green-500" size={20} />;
      case 'NEEDS_ATTENTION':
        return <AlertCircle className="text-amber-500" size={20} />;
      case 'FAILED':
        return <XCircle className="text-red-500" size={20} />;
      default:
        return null;
    }
  };

  const getOverallStatusBadge = (status) => {
    const badges = {
      PASSED: 'bg-green-100 text-green-800',
      ATTENTION_NEEDED: 'bg-amber-100 text-amber-800',
      FAILED: 'bg-red-100 text-red-800',
      PENDING: 'bg-slate-100 text-slate-800',
    };
    return `status-badge ${badges[status] || ''}`;
  };

  const openChecklistForm = () => {
    const driverId = isPersonalView ? (user?.driver_id || user?.id) : selectedDriver;
    setFormData({
      ...formData,
      driver_id: driverId,
      vehicle_id: selectedVehicle,
    });
    setDialogOpen(true);
  };

  return (
    <div className="p-6 lg:p-8" data-testid="pretrip-checklist-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">
          {isPersonalView ? 'My Pre-Trip Checklist' : 'Pre-Trip Checklist'}
        </h1>
        <p className="text-slate-600 mt-1">Complete vehicle inspection before starting your day</p>
      </div>

      {/* Driver & Vehicle Selection */}
      <div className="fleet-card mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          {isPersonalView ? 'Select Vehicle' : 'Select Driver & Vehicle'}
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Only show driver selection for staff */}
          {!isPersonalView ? (
            <div>
              <Label>Driver</Label>
              <Select value={selectedDriver} onValueChange={setSelectedDriver}>
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
          ) : (
            <div className="bg-slate-50 p-3 rounded-lg">
              <Label className="text-xs text-slate-500">Driver</Label>
              <p className="font-medium text-slate-800">{user?.full_name}</p>
            </div>
          )}
          <div>
            <Label>Vehicle</Label>
            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
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
        </div>

        {/* Today's Status */}
        {(isPersonalView || selectedDriver) && selectedVehicle && (
          <div className="mt-4 p-4 rounded-lg border border-slate-200">
            {checklistStatus && checklistStatus.completed ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-green-700">Today's Checklist Complete</p>
                  <p className="text-sm text-slate-600">
                    Completed at {new Date(checklistStatus.checklist?.created_at || checklistStatus.created_at).toLocaleTimeString()}
                  </p>
                </div>
                <span className={getOverallStatusBadge(checklistStatus.checklist?.overall_status || checklistStatus.overall_status)}>
                  {checklistStatus.checklist?.overall_status || checklistStatus.overall_status}
                </span>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-amber-700 flex items-center gap-2">
                    <AlertTriangle size={18} />
                    No checklist completed today
                  </p>
                  <p className="text-sm text-slate-600">Complete checklist before logging trips</p>
                </div>
                <Button onClick={openChecklistForm}>
                  <ClipboardCheck size={18} className="mr-2" />
                  Start Checklist
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Checklist Form Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pre-Trip Vehicle Inspection</DialogTitle>
            <DialogDescription>Check each item and note any issues</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {CHECKLIST_ITEMS.map(item => (
              <div key={item.key} className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-2 text-base">
                    <span>{item.icon}</span>
                    {item.label}
                  </Label>
                  <Select 
                    value={formData[item.key]} 
                    onValueChange={(value) => setFormData({...formData, [item.key]: value})}
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="OK">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="text-green-500" size={16} /> OK
                        </span>
                      </SelectItem>
                      <SelectItem value="NEEDS_ATTENTION">
                        <span className="flex items-center gap-2">
                          <AlertCircle className="text-amber-500" size={16} /> Needs Attention
                        </span>
                      </SelectItem>
                      <SelectItem value="FAILED">
                        <span className="flex items-center gap-2">
                          <XCircle className="text-red-500" size={16} /> Failed
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData[item.key] !== 'OK' && (
                  <Input
                    placeholder="Describe the issue..."
                    value={formData[`${item.key}_notes`]}
                    onChange={(e) => setFormData({...formData, [`${item.key}_notes`]: e.target.value})}
                    className="mt-2"
                  />
                )}
              </div>
            ))}

            {/* Photo Upload */}
            <div className="border rounded-lg p-4">
              <Label className="flex items-center gap-2 mb-2">
                <Camera size={18} />
                Damage Photos (Optional)
              </Label>
              <Input type="file" accept="image/*" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
              {formData.damage_photos.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {formData.damage_photos.map((url) => (
                    <img key={url} src={url} alt="Damage photo" className="w-20 h-20 object-cover rounded" />
                  ))}
                </div>
              )}
            </div>

            {/* Additional Notes */}
            <div>
              <Label>Additional Notes</Label>
              <Textarea 
                value={formData.additional_notes}
                onChange={(e) => setFormData({...formData, additional_notes: e.target.value})}
                placeholder="Any other observations..."
              />
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit">Complete Checklist</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Recent Checklists */}
      <div className="fleet-card">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          {isPersonalView ? 'My Recent Checklists' : 'Recent Checklists'}
        </h3>
        <div className="space-y-3">
          {checklists.length === 0 ? (
            <p className="text-slate-500 text-center py-8">No checklists completed yet</p>
          ) : (
            checklists.slice(0, 10).map(checklist => {
              const driver = drivers.find(d => d.id === checklist.driver_id);
              const vehicle = vehicles.find(v => v.id === checklist.vehicle_id);
              return (
                <div key={checklist.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="font-medium text-slate-800">
                      {vehicle?.registration_number || 'N/A'}
                      {!isPersonalView && ` - ${driver?.first_name || ''} ${driver?.last_name || ''}`}
                    </p>
                    <p className="text-sm text-slate-600">
                      {new Date(checklist.date || checklist.created_at).toLocaleDateString()} at {new Date(checklist.created_at).toLocaleTimeString()}
                    </p>
                  </div>
                  <span className={getOverallStatusBadge(checklist.overall_status)}>
                    {checklist.overall_status}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default PreTripChecklist;
