import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { ClipboardCheck, Camera, AlertTriangle, CheckCircle2, XCircle, AlertCircle, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditPreTripChecklist, canHardDelete } from '../utils/permissions';

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

const ITEM_NAME_TO_KEY = Object.fromEntries(
  CHECKLIST_ITEMS.map(({ key, label }) => [label, key])
);

const createInitialFormData = (user, isPersonalView) => ({
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

const checklistToFormData = (checklist, user, isPersonalView) => {
  const base = createInitialFormData(user, isPersonalView);
  base.driver_id = checklist.driver_id;
  base.vehicle_id = checklist.vehicle_id;
  base.damage_photos = checklist.damage_photos || [];
  base.additional_notes = checklist.notes || '';
  (checklist.checklist_items || []).forEach((item) => {
    const key = ITEM_NAME_TO_KEY[item.item_name];
    if (key) {
      base[key] = item.status;
      base[`${key}_notes`] = item.notes || '';
    }
  });
  return base;
};

const PreTripChecklist = () => {
  const { user, token, isDriverOrUser } = useAuth();
  const isPersonalView = isDriverOrUser && isDriverOrUser();
  const canDelete = canHardDelete(user?.role, 'pretrip_checklist');

  const [checklists, setChecklists] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checklistStatus, setChecklistStatus] = useState(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [sessionHint, setSessionHint] = useState(null);

  const [selectedDriver, setSelectedDriver] = useState(isPersonalView ? (user?.driver_id || user?.id) : '');
  const [selectedVehicle, setSelectedVehicle] = useState('');

  const [filterDriver, setFilterDriver] = useState(isPersonalView ? (user?.driver_id || user?.id) : 'ALL');
  const [filterVehicle, setFilterVehicle] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const [formData, setFormData] = useState(createInitialFormData(user, isPersonalView));

  const fetchData = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const params = { limit: 100 };
      if (isPersonalView) {
        params.driver_id = user?.driver_id || user?.id;
      } else if (filterDriver && filterDriver !== 'ALL') {
        params.driver_id = filterDriver;
      }
      if (filterVehicle && filterVehicle !== 'ALL') params.vehicle_id = filterVehicle;
      if (filterStatus && filterStatus !== 'ALL') params.overall_status = filterStatus;
      if (filterDateFrom) params.date_from = filterDateFrom;
      if (filterDateTo) params.date_to = filterDateTo;

      const [checklistsRes, driversRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/pre-trip-checklists`, { headers, params }),
        axios.get(`${API}/drivers`, { headers }),
        axios.get(`${API}/vehicles`, { headers }),
      ]);

      setChecklists(checklistsRes.data);
      setDrivers(driversRes.data);
      setVehicles(vehiclesRes.data);
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, isPersonalView, user, filterDriver, filterVehicle, filterStatus, filterDateFrom, filterDateTo]);

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
    } else {
      setChecklistStatus(null);
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

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setFormData(createInitialFormData(user, isPersonalView));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const driverId = isPersonalView ? (user?.driver_id || user?.id) : formData.driver_id;
    const submittedVehicleId = formData.vehicle_id;
    const wasCreate = !editingId;
    const payload = { ...formData, driver_id: driverId };
    const headers = token ? { Authorization: `Bearer ${token}` } : {};

    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/pre-trip-checklists/${editingId}`, payload, { headers })
          : axios.post(`${API}/pre-trip-checklists`, payload, { headers }),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: () => createInitialFormData(user, isPersonalView),
      onSuccess: async () => {
        await fetchData();
        if (wasCreate) {
          if (!isPersonalView) setSelectedDriver(driverId);
          setSelectedVehicle('');
          setChecklistStatus(null);
          const vehicle = vehicles.find((v) => v.id === submittedVehicleId);
          setSessionHint(
            vehicle
              ? `Checklist saved for ${vehicle.registration_number}. Select another vehicle to continue.`
              : 'Checklist saved. Select another vehicle to continue.'
          );
          toast.success('Checklist completed. You can inspect another vehicle now.');
        } else if (driverId && submittedVehicleId) {
          checkTodayStatus(driverId, submittedVehicleId);
        }
      },
      successMessage: editingId ? 'Checklist updated!' : 'Pre-trip checklist completed!',
      errorMessage: editingId ? 'Failed to update checklist' : 'Failed to submit checklist',
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.delete(`${API}/pre-trip-checklists/${deleteTarget.id}`, { headers });
      toast.success('Checklist deleted');
      setDeleteTarget(null);
      fetchData();
      const driverId = isPersonalView ? (user?.driver_id || user?.id) : selectedDriver;
      if (driverId && selectedVehicle) {
        checkTodayStatus(driverId, selectedVehicle);
      }
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete checklist');
    } finally {
      setDeleting(false);
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
    setEditingId(null);
    setSessionHint(null);
    setFormData({
      ...createInitialFormData(user, isPersonalView),
      driver_id: driverId,
      vehicle_id: selectedVehicle,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (checklist) => {
    setEditingId(checklist.id);
    setFormData(checklistToFormData(checklist, user, isPersonalView));
    setDialogOpen(true);
  };

  const historyRows = useMemo(() => checklists, [checklists]);

  if (loading) {
    return <div className="p-8 text-center">Loading checklists...</div>;
  }

  return (
    <div className="p-6 lg:p-8" data-testid="pretrip-checklist-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">
          {isPersonalView ? 'My Pre-Trip Checklist' : 'Pre-Trip Checklist'}
        </h1>
        <p className="text-slate-600 mt-1">
          Complete one inspection per vehicle per day. After submitting, select another vehicle to continue.
        </p>
      </div>

      <div className="fleet-card mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          {isPersonalView ? 'Select Vehicle' : 'Select Driver & Vehicle'}
        </h3>
        {sessionHint && (
          <div className="mb-4 p-3 rounded-lg bg-green-50 border border-green-200 text-sm text-green-800">
            {sessionHint}
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {!isPersonalView ? (
            <div>
              <Label>Driver</Label>
              <Select
                value={selectedDriver}
                onValueChange={(value) => {
                  setSelectedDriver(value);
                  setSessionHint(null);
                }}
              >
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
            <Select
              value={selectedVehicle}
              onValueChange={(value) => {
                setSelectedVehicle(value);
                setSessionHint(null);
              }}
            >
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

        {(isPersonalView || selectedDriver) && selectedVehicle && (
          <div className="mt-4 p-4 rounded-lg border border-slate-200">
            {checklistStatus && checklistStatus.completed ? (
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-green-700">Today's Checklist Complete</p>
                  <p className="text-sm text-slate-600">
                    Completed at {new Date(checklistStatus.checklist?.created_at || checklistStatus.created_at).toLocaleTimeString()}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Select another vehicle to submit an additional checklist.</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={getOverallStatusBadge(checklistStatus.checklist?.overall_status || checklistStatus.overall_status)}>
                    {checklistStatus.checklist?.overall_status || checklistStatus.overall_status}
                  </span>
                  {checklistStatus.checklist && canEditPreTripChecklist(user?.role, isPersonalView, checklistStatus.checklist, user) && (
                    <Button variant="outline" size="sm" onClick={() => openEditDialog(checklistStatus.checklist)}>
                      <Pencil size={14} className="mr-1" />
                      Edit
                    </Button>
                  )}
                </div>
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

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Pre-Trip Inspection' : 'Pre-Trip Vehicle Inspection'}</DialogTitle>
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

            <div>
              <Label>Additional Notes</Label>
              <Textarea
                value={formData.additional_notes}
                onChange={(e) => setFormData({...formData, additional_notes: e.target.value})}
                placeholder="Any other observations..."
              />
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
              <Button type="submit">{editingId ? 'Save Changes' : 'Complete Checklist'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete checklist?"
        description="Permanently delete this pre-trip checklist? This cannot be undone."
        onConfirm={handleDelete}
        loading={deleting}
      />

      <div className="fleet-card">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">
          {isPersonalView ? 'My Checklist History' : 'Checklist History'}
        </h3>
        <p className="text-sm text-slate-500 mb-4">Showing up to 100 most recent checklists</p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
          {!isPersonalView && (
            <div>
              <Label className="text-xs">Driver</Label>
              <Select value={filterDriver} onValueChange={setFilterDriver}>
                <SelectTrigger>
                  <SelectValue placeholder="All drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All drivers</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label className="text-xs">Vehicle</Label>
            <Select value={filterVehicle} onValueChange={setFilterVehicle}>
              <SelectTrigger>
                <SelectValue placeholder="All vehicles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All vehicles</SelectItem>
                {vehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.registration_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="PASSED">Passed</SelectItem>
                <SelectItem value="ATTENTION_NEEDED">Attention Needed</SelectItem>
                <SelectItem value="FAILED">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">From</Label>
            <Input type="date" value={filterDateFrom} onChange={(e) => setFilterDateFrom(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">To</Label>
            <Input type="date" value={filterDateTo} onChange={(e) => setFilterDateTo(e.target.value)} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                {!isPersonalView && <th>Driver</th>}
                <th>Vehicle</th>
                <th>Status</th>
                <th className="w-24">Actions</th>
              </tr>
            </thead>
            <tbody>
              {historyRows.length === 0 ? (
                <tr>
                  <td colSpan={isPersonalView ? 4 : 5} className="text-center py-8 text-slate-500">
                    No checklists found
                  </td>
                </tr>
              ) : (
                historyRows.map((checklist) => {
                  const driver = drivers.find((d) => d.id === checklist.driver_id);
                  const vehicle = vehicles.find((v) => v.id === checklist.vehicle_id);
                  const canEdit = canEditPreTripChecklist(user?.role, isPersonalView, checklist, user);
                  return (
                    <tr key={checklist.id}>
                      <td>
                        {new Date(checklist.date || checklist.created_at).toLocaleDateString()}{' '}
                        <span className="text-xs text-slate-500">
                          {new Date(checklist.created_at).toLocaleTimeString()}
                        </span>
                      </td>
                      {!isPersonalView && (
                        <td>{driver ? `${driver.first_name} ${driver.last_name}` : '—'}</td>
                      )}
                      <td className="font-semibold">{vehicle?.registration_number || 'N/A'}</td>
                      <td>
                        <span className={getOverallStatusBadge(checklist.overall_status)}>
                          {checklist.overall_status}
                        </span>
                      </td>
                      <td>
                        <div className="flex gap-1">
                          {canEdit && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(checklist)}>
                              <Pencil size={16} />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600"
                              onClick={() => setDeleteTarget(checklist)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </div>
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
