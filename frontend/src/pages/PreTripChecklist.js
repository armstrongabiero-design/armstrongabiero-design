import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { ClipboardCheck, Camera, AlertTriangle, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
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
  const [checklists, setChecklists] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checklistStatus, setChecklistStatus] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const [selectedDriver, setSelectedDriver] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  
  const [formData, setFormData] = useState({
    driver_id: '',
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

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedDriver && selectedVehicle) {
      checkTodayStatus();
    }
  }, [selectedDriver, selectedVehicle]);

  const fetchData = async () => {
    try {
      const [checklistsRes, driversRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/pre-trip-checklists`),
        axios.get(`${API}/drivers`),
        axios.get(`${API}/vehicles`),
      ]);
      setChecklists(checklistsRes.data);
      setDrivers(driversRes.data);
      setVehicles(vehiclesRes.data);
    } catch (error) {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const checkTodayStatus = async () => {
    try {
      const response = await axios.get(`${API}/pre-trip-checklists/today/${selectedDriver}/${selectedVehicle}`);
      setChecklistStatus(response.data);
    } catch (error) {
      setChecklistStatus(null);
    }
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingPhoto(true);
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);

    try {
      const response = await axios.post(`${API}/pre-trip-checklists/upload-photo`, formDataUpload, {
        headers: { 'Content-Type': 'multipart/form-data' }
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
    try {
      await axios.post(`${API}/pre-trip-checklists`, formData);
      toast.success('Pre-trip checklist completed! You can now log trips and fuel.');
      setDialogOpen(false);
      fetchData();
      checkTodayStatus();
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
    setFormData({
      ...formData,
      driver_id: selectedDriver,
      vehicle_id: selectedVehicle,
    });
    setDialogOpen(true);
  };

  return (
    <div className="p-6 lg:p-8" data-testid="pretrip-checklist-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">Pre-Trip Checklist</h1>
        <p className="text-slate-600 mt-1">Complete vehicle inspection before starting your day</p>
      </div>

      {/* Driver & Vehicle Selection */}
      <div className="fleet-card mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Select Driver & Vehicle</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        {selectedDriver && selectedVehicle && (
          <div className="mt-6">
            {checklistStatus?.completed ? (
              <div className={`p-4 rounded-lg ${checklistStatus.can_log_trips ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                <div className="flex items-center gap-2">
                  {checklistStatus.can_log_trips ? (
                    <CheckCircle2 className="text-green-600" size={24} />
                  ) : (
                    <XCircle className="text-red-600" size={24} />
                  )}
                  <div>
                    <p className="font-semibold text-slate-800">
                      {checklistStatus.can_log_trips ? "Today's checklist completed!" : "Checklist completed but vehicle needs attention"}
                    </p>
                    <p className="text-sm text-slate-600">
                      {checklistStatus.can_log_trips 
                        ? "You can now log fuel and trips for this vehicle."
                        : "Please address vehicle issues before proceeding."}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="text-amber-600" size={24} />
                  <div>
                    <p className="font-semibold text-amber-800">Pre-Trip Checklist Required</p>
                    <p className="text-sm text-amber-700">Complete the inspection before logging fuel or trips.</p>
                  </div>
                </div>
                <Button onClick={openChecklistForm} data-testid="start-checklist-btn">
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
            <DialogDescription>
              Inspect your vehicle before starting. Mark any issues found.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-6">
            {CHECKLIST_ITEMS.map((item) => (
              <div key={item.key} className="border-b pb-4">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-base flex items-center gap-2">
                    <span>{item.icon}</span>
                    {item.label}
                  </Label>
                  <div className="flex gap-1">
                    {['OK', 'NEEDS_ATTENTION', 'FAILED'].map((status) => (
                      <Button
                        key={status}
                        type="button"
                        size="sm"
                        variant={formData[item.key] === status ? 'default' : 'outline'}
                        className={formData[item.key] === status ? (
                          status === 'OK' ? 'bg-green-500 hover:bg-green-600' :
                          status === 'NEEDS_ATTENTION' ? 'bg-amber-500 hover:bg-amber-600' :
                          'bg-red-500 hover:bg-red-600'
                        ) : ''}
                        onClick={() => setFormData({...formData, [item.key]: status})}
                      >
                        {status === 'OK' ? '✓ OK' : status === 'NEEDS_ATTENTION' ? '⚠ Attention' : '✗ Failed'}
                      </Button>
                    ))}
                  </div>
                </div>
                {formData[item.key] !== 'OK' && (
                  <Input
                    placeholder={`Notes for ${item.label.toLowerCase()}...`}
                    value={formData[`${item.key}_notes`]}
                    onChange={(e) => setFormData({...formData, [`${item.key}_notes`]: e.target.value})}
                    className="mt-2"
                  />
                )}
              </div>
            ))}

            {/* Photo Upload */}
            <div className="border-b pb-4">
              <Label className="text-base flex items-center gap-2 mb-2">
                <Camera size={18} />
                Damage Photos
              </Label>
              <p className="text-sm text-slate-500 mb-2">Upload photos of any damage found during inspection</p>
              <div className="flex flex-wrap gap-2 mb-2">
                {formData.damage_photos.map((url, index) => (
                  <div key={index} className="relative w-20 h-20 border rounded overflow-hidden">
                    <img src={`${BACKEND_URL}${url}`} alt={`Damage ${index + 1}`} className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setFormData({
                        ...formData,
                        damage_photos: formData.damage_photos.filter((_, i) => i !== index)
                      })}
                      className="absolute top-0 right-0 bg-red-500 text-white p-1 text-xs"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <Input
                type="file"
                accept="image/*"
                onChange={handlePhotoUpload}
                disabled={uploadingPhoto}
              />
              {uploadingPhoto && <p className="text-sm text-slate-500 mt-1">Uploading...</p>}
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
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Recent Checklists</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Driver</th>
                <th>Vehicle</th>
                <th>Status</th>
                <th>Issues</th>
                <th>Photos</th>
              </tr>
            </thead>
            <tbody>
              {checklists.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-slate-500">No checklists completed yet</td>
                </tr>
              ) : (
                checklists.slice(0, 20).map((checklist) => {
                  const driver = drivers.find(d => d.id === checklist.driver_id);
                  const vehicle = vehicles.find(v => v.id === checklist.vehicle_id);
                  const issueCount = checklist.checklist_items?.filter(i => i.status !== 'OK').length || 0;
                  return (
                    <tr key={checklist.id}>
                      <td>{new Date(checklist.date).toLocaleDateString()}</td>
                      <td className="font-semibold">{driver?.first_name} {driver?.last_name}</td>
                      <td>{vehicle?.registration_number}</td>
                      <td>
                        <span className={getOverallStatusBadge(checklist.overall_status)}>
                          {checklist.overall_status}
                        </span>
                      </td>
                      <td>
                        {issueCount > 0 ? (
                          <span className="text-amber-600 font-semibold">{issueCount} issue(s)</span>
                        ) : (
                          <span className="text-green-600">All OK</span>
                        )}
                      </td>
                      <td>
                        {checklist.damage_photos?.length > 0 ? (
                          <span className="text-purple-600">{checklist.damage_photos.length} photo(s)</span>
                        ) : (
                          <span className="text-slate-400">-</span>
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

export default PreTripChecklist;
