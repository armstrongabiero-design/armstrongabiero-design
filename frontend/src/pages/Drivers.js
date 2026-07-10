import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Pencil, Trash2, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import CountrySelect, {
  DEFAULT_COUNTRY_CODE,
  getCountryBadgeClass,
  getCountryLabel,
  normalizeCountryCode,
} from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialFormData = () => ({
  country: DEFAULT_COUNTRY_CODE,
  first_name: '',
  last_name: '',
  license_number: '',
  license_expiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  phone: '',
  email: '',
});

const driverToFormData = (driver) => {
  const expiry = driver.license_expiry;
  const licenseExpiry =
    typeof expiry === 'string'
      ? expiry.split('T')[0]
      : expiry
        ? new Date(expiry).toISOString().split('T')[0]
        : createInitialFormData().license_expiry;

  return {
    country: normalizeCountryCode(driver.country),
    first_name: driver.first_name,
    last_name: driver.last_name,
    license_number: driver.license_number,
    license_expiry: licenseExpiry,
    phone: driver.phone,
    email: driver.email || '',
  };
};

const Drivers = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'driver');

  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkCountry, setBulkCountry] = useState(DEFAULT_COUNTRY_CODE);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [formData, setFormData] = useState(createInitialFormData);

  useEffect(() => {
    fetchDrivers();
  }, []);

  const fetchDrivers = async () => {
    try {
      const response = await axios.get(`${API}/drivers`);
      setDrivers(response.data);
    } catch {
      toast.error('Failed to load drivers');
    } finally {
      setLoading(false);
    }
  };

  const handleDialogOpenChange = (open) => {
    setDialogOpen(open);
    if (!open) {
      setEditingId(null);
      setFormData(createInitialFormData());
    }
  };

  const openCreateDialog = () => {
    setEditingId(null);
    setFormData(createInitialFormData());
    setDialogOpen(true);
  };

  const openEditDialog = (driver) => {
    setEditingId(driver.id);
    setFormData(driverToFormData(driver));
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      license_expiry: new Date(formData.license_expiry).toISOString(),
    };

    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/drivers/${editingId}`, payload)
          : axios.post(`${API}/drivers`, payload),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: createInitialFormData,
      onSuccess: fetchDrivers,
      successMessage: editingId ? 'Driver updated successfully!' : 'Driver added successfully!',
      errorMessage: editingId ? 'Failed to update driver' : 'Failed to add driver',
    });
    setEditingId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/drivers/${deleteTarget.id}`);
      toast.success('Driver deleted');
      setDeleteTarget(null);
      fetchDrivers();
    } catch (error) {
      const detail = error.response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to delete driver');
    } finally {
      setDeleting(false);
    }
  };

  const resetBulkDialog = () => {
    setBulkFile(null);
    setBulkResult(null);
    setBulkCountry(DEFAULT_COUNTRY_CODE);
  };

  const handleBulkDialogOpenChange = (open) => {
    setBulkDialogOpen(open);
    if (!open) resetBulkDialog();
  };

  const downloadBulkTemplate = async () => {
    try {
      const response = await axios.get(`${API}/drivers/bulk-upload/template`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'driver-import-template.xlsx');
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
    uploadData.append('country', bulkCountry);
    setBulkUploading(true);
    setBulkResult(null);
    try {
      const { data } = await axios.post(`${API}/drivers/bulk-upload`, uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBulkResult(data);
      if (data.created > 0) {
        fetchDrivers();
        toast.success(`${data.created} driver${data.created === 1 ? '' : 's'} imported`);
      }
      if (data.failed > 0 && data.created === 0) {
        toast.error('No drivers were imported. Review the errors below.');
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

  if (loading) {
    return <div className="p-8 text-center">Loading drivers...</div>;
  }

  return (
    <div className="p-6 lg:p-8" data-testid="drivers-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Drivers</h1>
          <p className="text-slate-600 mt-1">Manage driver profiles and safety scores</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
          <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
            <DialogTrigger asChild>
              <Button data-testid="add-driver-btn" onClick={openCreateDialog}>
                <Plus size={18} className="mr-2" />
                Add Driver
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>{editingId ? 'Edit Driver' : 'Add New Driver'}</DialogTitle>
                <DialogDescription>
                  {editingId
                    ? 'Update driver license and contact details.'
                    : 'Register a new driver with their license and contact details.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Country</Label>
                  <CountrySelect
                    value={formData.country}
                    onValueChange={(value) => setFormData({ ...formData, country: value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>First Name</Label>
                    <Input
                      value={formData.first_name}
                      onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label>Last Name</Label>
                    <Input
                      value={formData.last_name}
                      onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label>License Number</Label>
                  <Input
                    value={formData.license_number}
                    onChange={(e) => setFormData({ ...formData, license_number: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>License Expiry</Label>
                  <Input
                    type="date"
                    value={formData.license_expiry}
                    onChange={(e) => setFormData({ ...formData, license_expiry: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">{editingId ? 'Save Changes' : 'Add Driver'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>

          <Button variant="outline" data-testid="bulk-upload-drivers-btn" onClick={() => setBulkDialogOpen(true)}>
            <Upload size={18} className="mr-2" />
            Bulk Upload
          </Button>

          <Dialog open={bulkDialogOpen} onOpenChange={handleBulkDialogOpenChange}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Bulk Upload Drivers</DialogTitle>
                <DialogDescription>
                  Import multiple drivers from an Excel file. Download the template, fill in your data, then upload.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleBulkUpload} className="space-y-4">
                <div>
                  <Label>Country (applies to all rows)</Label>
                  <CountrySelect value={bulkCountry} onValueChange={setBulkCountry} />
                </div>
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
                    Columns: First Name, Last Name, License Number, License Expiry, Phone, Email.
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
                            {err.license_number ? ` (${err.license_number})` : ''}: {err.message}
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
          </div>
        )}
      </div>

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>License</th>
              <th>Country</th>
              <th>Phone</th>
              <th>Email</th>
              <th>Safety Score</th>
              <th>Status</th>
              {canEdit && <th className="w-24">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {drivers.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 8 : 7} className="text-center py-8 text-slate-500">
                  No drivers found
                </td>
              </tr>
            ) : (
              drivers.map((driver) => (
                <tr key={driver.id}>
                  <td className="font-semibold">
                    {driver.first_name} {driver.last_name}
                  </td>
                  <td className="text-xs font-mono">{driver.license_number}</td>
                  <td>
                    <span className={getCountryBadgeClass(driver.country)}>
                      {getCountryLabel(driver.country)}
                    </span>
                  </td>
                  <td>{driver.phone}</td>
                  <td>{driver.email || '-'}</td>
                  <td>{driver.safety_score ?? '-'}</td>
                  <td>
                    <span className={`status-badge ${driver.status?.toLowerCase()}`}>{driver.status}</span>
                  </td>
                  {canEdit && (
                    <td>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit driver"
                          onClick={() => openEditDialog(driver)}
                        >
                          <Pencil size={16} />
                        </Button>
                        {canDelete && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            title="Delete driver"
                            onClick={() => setDeleteTarget(driver)}
                          >
                            <Trash2 size={16} />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="Delete driver?"
        description={
          deleteTarget
            ? `Permanently delete ${deleteTarget.first_name} ${deleteTarget.last_name}? This cannot be undone.`
            : undefined
        }
      />
    </div>
  );
};

export default Drivers;
