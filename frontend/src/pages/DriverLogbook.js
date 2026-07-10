import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Plus, Book, Pencil, Trash2, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { DEFAULT_COUNTRY_CODE, normalizeCountryCode } from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditFleetRecord, canEditLogbookEntry, canHardDelete } from '../utils/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialFormData = (user, isPersonalView) => ({
  driver_id: isPersonalView ? (user?.driver_id || user?.id) : '',
  vehicle_id: '',
  country: normalizeCountryCode(user?.country) || DEFAULT_COUNTRY_CODE,
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

const isoToDateInput = (iso) => {
  if (!iso) return '';
  return new Date(iso).toISOString().split('T')[0];
};

const isoToTimeInput = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
};

const entryToFormData = (entry) => ({
  driver_id: entry.driver_id,
  vehicle_id: entry.vehicle_id,
  country: normalizeCountryCode(entry.country) || DEFAULT_COUNTRY_CODE,
  date: isoToDateInput(entry.date),
  start_time: isoToTimeInput(entry.start_time),
  end_time: isoToTimeInput(entry.end_time),
  start_location: entry.start_location,
  end_location: entry.end_location || '',
  start_odometer: entry.start_odometer,
  end_odometer: entry.end_odometer ?? '',
  purpose: entry.purpose,
  fuel_used_liters: entry.fuel_used_liters ?? '',
  notes: entry.notes || '',
});

const DriverLogbook = () => {
  const { user, token, isDriverOrUser } = useAuth();
  const isPersonalView = isDriverOrUser && isDriverOrUser();
  
  const [entries, setEntries] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(isPersonalView ? (user?.driver_id || user?.id) : '');
  const [driverSummary, setDriverSummary] = useState(null);

  const [formData, setFormData] = useState(() => createInitialFormData(user, isPersonalView));

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

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setFormData(createInitialFormData(user, isPersonalView));
    }
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setFormData(createInitialFormData(user, isPersonalView));
    setDialogOpen(true);
  };

  const openEditDialog = (entry) => {
    setEditingId(entry.id);
    setFormData(entryToFormData(entry));
    setDialogOpen(true);
  };

  const buildLogbookPayload = (data, driverId) => ({
    ...data,
    driver_id: driverId,
    country: data.country || user?.country || DEFAULT_COUNTRY_CODE,
    date: new Date(data.date).toISOString(),
    start_time: new Date(`${data.date}T${data.start_time}`).toISOString(),
    end_time: data.end_time ? new Date(`${data.date}T${data.end_time}`).toISOString() : null,
    start_odometer: parseFloat(data.start_odometer),
    end_odometer: data.end_odometer ? parseFloat(data.end_odometer) : null,
    fuel_used_liters: data.fuel_used_liters ? parseFloat(data.fuel_used_liters) : null,
  });

  const handleSubmit = async (e) => {
    e.preventDefault();

    const driverId = isPersonalView ? (user?.driver_id || user?.id) : formData.driver_id;
    const driver = drivers.find((d) => d.id === driverId);
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const payload = buildLogbookPayload(
      { ...formData, country: driver?.country || user?.country || formData.country },
      driverId
    );

    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/logbook/${editingId}`, payload, { headers })
          : axios.post(`${API}/logbook`, payload, { headers }),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: () => createInitialFormData(user, isPersonalView),
      onSuccess: fetchData,
      successMessage: editingId ? 'Logbook entry updated!' : 'Logbook entry added!',
      errorMessage: editingId ? 'Failed to update logbook entry' : 'Failed to add logbook entry',
    });
    setEditingId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.delete(`${API}/logbook/${deleteTarget.id}`, { headers });
      toast.success('Logbook entry deleted');
      setDeleteTarget(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete entry');
    } finally {
      setDeleting(false);
    }
  };

  const resetBulkDialog = () => {
    setBulkFile(null);
    setBulkResult(null);
  };

  const handleBulkDialogOpenChange = (open) => {
    setBulkDialogOpen(open);
    if (!open) resetBulkDialog();
  };

  const downloadBulkTemplate = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.get(`${API}/logbook/bulk-upload/template`, {
        headers,
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'logbook-import-template.xlsx');
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download template');
    }
  };

  const handleBulkUpload = async (e) => {
    e.preventDefault();
    if (!bulkFile) {
      toast.error('Please select an Excel file to upload');
      return;
    }
    const uploadData = new FormData();
    uploadData.append('file', bulkFile);
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/logbook/bulk-upload`, uploadData, {
        headers: { ...headers, 'Content-Type': 'multipart/form-data' },
      });
      setBulkResult(data);
      if (data.created > 0) {
        fetchData();
        toast.success(`${data.created} entr${data.created === 1 ? 'y' : 'ies'} imported`);
      }
      if (data.failed > 0 && data.created === 0) {
        toast.error('No entries were imported. Review the errors below.');
      } else if (data.failed > 0) {
        toast.warning(`${data.failed} row${data.failed === 1 ? '' : 's'} could not be imported`);
      }
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Bulk upload failed');
    } finally {
      setBulkUploading(false);
    }
  };

  const canEdit = canEditLogbookEntry(user?.role, isPersonalView);
  const canBulkUpload = canEditFleetRecord(user?.role) && !isPersonalView;
  const canDelete = canHardDelete(user?.role, 'logbook_entry');

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
          {canBulkUpload && (
            <>
              <Button
                variant="outline"
                data-testid="bulk-upload-logbook-btn"
                onClick={() => setBulkDialogOpen(true)}
              >
                <Upload size={18} className="mr-2" />
                Bulk Upload
              </Button>
              <Dialog open={bulkDialogOpen} onOpenChange={handleBulkDialogOpenChange}>
                <DialogContent className="max-w-lg">
                  <DialogHeader>
                    <DialogTitle>Bulk Upload Logbook</DialogTitle>
                    <DialogDescription>
                      Import trip entries from Excel. Each row needs a matching driver license,
                      vehicle registration, and a completed pre-trip checklist for that date.
                    </DialogDescription>
                  </DialogHeader>
                  <form onSubmit={handleBulkUpload} className="space-y-4">
                    <div>
                      <Button type="button" variant="outline" className="w-full" onClick={downloadBulkTemplate}>
                        <Download size={16} className="mr-2" />
                        Download sample template (.xlsx)
                      </Button>
                    </div>
                    <div>
                      <Label>Excel file</Label>
                      <Input
                        type="file"
                        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                        required
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Columns: License Number, Vehicle Registration, Date, Start/End Time,
                        Locations, Odometers, Purpose, Fuel Used (L), Notes.
                      </p>
                    </div>
                    {bulkResult && (
                      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
                        <p className="font-medium text-slate-800">
                          Imported {bulkResult.created} · Failed {bulkResult.failed}
                        </p>
                        {bulkResult.errors?.length > 0 && (
                          <ul className="max-h-32 overflow-y-auto text-red-700 space-y-1">
                            {bulkResult.errors.map((err, idx) => (
                              <li key={idx}>
                                {err.row ? `Row ${err.row}` : 'Import'}
                                {err.license_number || err.registration_number
                                  ? ` (${[err.license_number, err.registration_number].filter(Boolean).join(', ')})`
                                  : ''}
                                : {err.message}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end gap-2">
                      <Button type="button" variant="outline" onClick={() => handleBulkDialogOpenChange(false)}>
                        Close
                      </Button>
                      <Button type="submit" disabled={bulkUploading}>
                        {bulkUploading ? 'Uploading…' : 'Upload & Import'}
                      </Button>
                    </div>
                  </form>
                </DialogContent>
              </Dialog>
            </>
          )}
          {canEdit && (
          <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button data-testid="add-entry-btn" onClick={openCreateDialog}>
                <Plus size={18} className="mr-2" />
                Add Entry
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Logbook Entry' : 'New Logbook Entry'}</DialogTitle>
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
                  <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
                  <Button type="submit">{editingId ? 'Save Changes' : 'Save Entry'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
          )}
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
              {canEdit && <th className="w-24">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={isPersonalView ? (canEdit ? 7 : 6) : (canEdit ? 8 : 7)} className="text-center py-8 text-slate-500">
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
                    {canEdit && (
                      <td>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditDialog(entry)}>
                            <Pencil size={16} />
                          </Button>
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setDeleteTarget(entry)}
                            >
                              <Trash2 size={16} />
                            </Button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="Delete logbook entry?"
        description={deleteTarget ? `Permanently delete this trip on ${new Date(deleteTarget.date).toLocaleDateString()}?` : undefined}
      />
    </div>
  );
};

export default DriverLogbook;
