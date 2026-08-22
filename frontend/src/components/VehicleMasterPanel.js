import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, ExternalLink, Upload, Download } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import CountrySelect, { DEFAULT_COUNTRY_CODE, getCountryLabel } from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import HorizontalScrollContainer from '../components/HorizontalScrollContainer';
import { completeDialogSubmit } from '../utils/formUtils';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export const VEHICLE_MASTER_FIELDS = [
  { key: 'serial_no', label: 'Serial No' },
  { key: 'manufacturer', label: 'Manufacturer' },
  { key: 'vehicle_category', label: 'Vehicle Category' },
  { key: 'description', label: 'Description' },
  { key: 'acquisition_date', label: 'Acquisition Date' },
  { key: 'make', label: 'Make' },
  { key: 'model', label: 'Model' },
  { key: 'country_of_origin', label: 'Country of Origin' },
  { key: 'year_of_manufacture', label: 'Year of Manufacture', type: 'number' },
  { key: 'quantity', label: 'Quantity', type: 'number' },
  { key: 'chassis_vin', label: 'Chassis / VIN' },
  { key: 'use_type', label: 'Use Type' },
  { key: 'transmission', label: 'Transmission' },
  { key: 'registration_number', label: 'Registration Number' },
  { key: 'tyre_size_front', label: 'Tyre Size (Front)' },
  { key: 'tyre_size_rear', label: 'Tyre Size (Rear)' },
  { key: 'tyre_size_spare', label: 'Tyre Size (Spare)' },
  { key: 'weight_unit', label: 'Weight Unit' },
  { key: 'seating_capacity', label: 'Seating Capacity', type: 'number' },
  { key: 'max_speed', label: 'Max Speed', type: 'number' },
  { key: 'speed_unit', label: 'Speed Unit' },
  { key: 'number_of_wheels', label: 'Number of Wheels', type: 'number' },
  { key: 'axle_config', label: 'Axle Config' },
  { key: 'engine_capacity_cc', label: 'Engine Capacity (cc)', type: 'number' },
  { key: 'power_value', label: 'Power Value', type: 'number' },
  { key: 'power_unit', label: 'Power Unit' },
  { key: 'cylinders', label: 'Cylinders', type: 'number' },
  { key: 'engine_type', label: 'Engine Type' },
  { key: 'fuel_type', label: 'Fuel Type' },
  { key: 'book_value', label: 'Book Value', type: 'number' },
  { key: 'fuel_consumption', label: 'Fuel Consumption' },
  { key: 'active_flag', label: 'Active Flag' },
];

const emptyForm = () => {
  const base = { country: DEFAULT_COUNTRY_CODE, linked_vehicle_id: '' };
  VEHICLE_MASTER_FIELDS.forEach((f) => {
    base[f.key] = '';
  });
  return base;
};

const recordToForm = (row) => {
  const form = emptyForm();
  form.country = row.country || DEFAULT_COUNTRY_CODE;
  form.linked_vehicle_id = row.linked_vehicle_id || '';
  VEHICLE_MASTER_FIELDS.forEach((f) => {
    form[f.key] = row[f.key] == null ? '' : String(row[f.key]);
  });
  return form;
};

const toPayload = (form) => {
  const payload = {
    country: form.country || null,
    linked_vehicle_id: form.linked_vehicle_id || null,
  };
  VEHICLE_MASTER_FIELDS.forEach((f) => {
    const raw = form[f.key];
    if (raw === '' || raw == null) {
      payload[f.key] = null;
      return;
    }
    if (f.type === 'number') {
      const n = Number(raw);
      payload[f.key] = Number.isNaN(n) ? null : n;
    } else {
      payload[f.key] = raw;
    }
  });
  return payload;
};

const VehicleMasterPanel = ({ canEdit, canDelete }) => {
  const [rows, setRows] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [countryFilter, setCountryFilter] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyForm);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [bulkFile, setBulkFile] = useState(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkResult, setBulkResult] = useState(null);
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  const fetchRows = useCallback(async () => {
    try {
      const params = {};
      if (countryFilter !== 'ALL') params.country = countryFilter;
      const [res, vehRes] = await Promise.all([
        axios.get(`${API}/master/vehicles`, { params }),
        axios.get(`${API}/vehicles`),
      ]);
      setRows(res.data || []);
      setVehicles(vehRes.data || []);
    } catch {
      toast.error('Failed to load vehicle master data');
    } finally {
      setLoading(false);
    }
  }, [countryFilter]);

  useEffect(() => {
    setLoading(true);
    fetchRows();
  }, [fetchRows]);

  const openCreate = () => {
    setEditingId(null);
    setFormData(emptyForm());
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setFormData(recordToForm(row));
    setDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = toPayload(formData);
    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/master/vehicles/${editingId}`, payload)
          : axios.post(`${API}/master/vehicles`, payload),
      setDialogOpen,
      setFormData,
      initialFormData: emptyForm,
      onSuccess: fetchRows,
      successMessage: editingId ? 'Vehicle master updated' : 'Vehicle master created',
      errorMessage: 'Failed to save vehicle master record',
    });
    setEditingId(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/master/vehicles/${deleteTarget.id}`);
      toast.success('Vehicle master record deleted');
      setDeleteTarget(null);
      fetchRows();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete');
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
      const response = await axios.get(`${API}/master/vehicles/bulk-upload/template`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', 'vehicle-master-import-template.xlsx');
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
      const { data } = await axios.post(`${API}/master/vehicles/bulk-upload`, uploadData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setBulkResult(data);
      const total = (data.created || 0) + (data.updated || 0);
      if (total > 0) {
        fetchRows();
        toast.success(`${data.created || 0} created, ${data.updated || 0} updated`);
      }
      if (data.failed > 0 && total === 0) {
        toast.error('No records were imported. Review the errors below.');
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
    return <div className="py-8 text-center text-slate-600">Loading vehicle master…</div>;
  }

  return (
    <div data-testid="vehicle-master-panel">
      <div className="flex flex-wrap justify-between items-center gap-2 mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <CountrySelect
            value={countryFilter}
            onValueChange={setCountryFilter}
            includeAllOption
            allLabel="All Countries"
            className="w-full sm:w-64"
          />
          <Link to="/vehicles" className="text-sm text-amber-700 underline inline-flex items-center gap-1">
            Open Vehicles <ExternalLink size={12} />
          </Link>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setBulkDialogOpen(true)}>
              <Upload size={18} className="mr-2" />
              Bulk Upload
            </Button>
            <Button onClick={openCreate}>
              <Plus size={18} className="mr-2" />
              Add Vehicle Master
            </Button>
          </div>
        )}
      </div>

      <div className="fleet-card p-0 overflow-hidden table-container">
        <HorizontalScrollContainer>
          <table className="min-w-max text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50">Registration</th>
                <th>Make</th>
                <th>Model</th>
                <th>Category</th>
                <th>Chassis / VIN</th>
                <th>Year</th>
                <th>Fuel</th>
                <th>Country</th>
                <th>Linked Vehicle</th>
                {VEHICLE_MASTER_FIELDS.filter(
                  (f) =>
                    !['registration_number', 'make', 'model', 'vehicle_category', 'chassis_vin', 'year_of_manufacture', 'fuel_type'].includes(
                      f.key
                    )
                ).map((f) => (
                  <th key={f.key}>{f.label}</th>
                ))}
                {canEdit && <th className="w-24">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-8 text-slate-500">
                    No vehicle master records. Use Add to enter template fields.
                  </td>
                </tr>
              ) : (
                rows.map((row) => {
                  const linked = vehicles.find((v) => v.id === row.linked_vehicle_id);
                  return (
                    <tr key={row.id}>
                      <td className="sticky left-0 z-10 bg-white font-semibold">
                        {row.registration_number || '—'}
                      </td>
                      <td>{row.make || '—'}</td>
                      <td>{row.model || '—'}</td>
                      <td>{row.vehicle_category || '—'}</td>
                      <td className="font-mono text-xs">{row.chassis_vin || '—'}</td>
                      <td>{row.year_of_manufacture ?? '—'}</td>
                      <td>{row.fuel_type || '—'}</td>
                      <td>{getCountryLabel(row.country) || row.country || '—'}</td>
                      <td>
                        {linked ? (
                          <Link
                            to={`/vehicles?q=${encodeURIComponent(linked.registration_number || '')}`}
                            className="text-amber-700 underline text-xs"
                          >
                            {linked.registration_number}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      {VEHICLE_MASTER_FIELDS.filter(
                        (f) =>
                          !['registration_number', 'make', 'model', 'vehicle_category', 'chassis_vin', 'year_of_manufacture', 'fuel_type'].includes(
                            f.key
                          )
                      ).map((f) => (
                        <td key={f.key}>{row[f.key] ?? '—'}</td>
                      ))}
                      {canEdit && (
                        <td>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(row)}>
                              <Pencil size={16} />
                            </Button>
                            {canDelete && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-red-600"
                                onClick={() => setDeleteTarget(row)}
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
        </HorizontalScrollContainer>
      </div>

      <Dialog open={bulkDialogOpen} onOpenChange={handleBulkDialogOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bulk Upload Vehicle Master</DialogTitle>
            <DialogDescription>
              Import vehicle master records from Excel. Existing registrations are updated and linked vehicles are synced automatically.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleBulkUpload} className="space-y-4">
            <Button type="button" variant="outline" className="w-full" onClick={downloadBulkTemplate}>
              <Download size={16} className="mr-2" />
              Download template (.xlsx)
            </Button>
            <div>
              <Label>Excel file</Label>
              <Input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setBulkFile(e.target.files?.[0] || null)}
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Template includes all extended master fields (registration, make, model, VIN, tyres, engine, etc.).
              </p>
            </div>
            {bulkResult && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm space-y-2">
                <p className="font-medium text-slate-800">
                  Created {bulkResult.created || 0} · Updated {bulkResult.updated || 0} · Failed {bulkResult.failed || 0}
                </p>
                {bulkResult.errors?.length > 0 && (
                  <ul className="max-h-32 overflow-y-auto text-red-700 space-y-1">
                    {bulkResult.errors.map((err, idx) => (
                      <li key={idx}>
                        {err.row ? `Row ${err.row}` : 'Import'}: {err.message}
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Vehicle Master' : 'Add Vehicle Master'}</DialogTitle>
            <DialogDescription>
              Fields match the Fleet Department master-data template. Link an operational vehicle when available.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Operating Country</Label>
                <CountrySelect
                  value={formData.country}
                  onValueChange={(v) => setFormData({ ...formData, country: v })}
                />
              </div>
              <div>
                <Label>Linked Vehicle (optional)</Label>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.linked_vehicle_id || ''}
                  onChange={(e) => setFormData({ ...formData, linked_vehicle_id: e.target.value })}
                >
                  <option value="">None</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.registration_number} — {v.make} {v.model}
                    </option>
                  ))}
                </select>
              </div>
              {VEHICLE_MASTER_FIELDS.map((f) => (
                <div key={f.key}>
                  <Label>{f.label}</Label>
                  <Input
                    type={f.type === 'number' ? 'number' : 'text'}
                    value={formData[f.key] ?? ''}
                    onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">{editingId ? 'Save' : 'Create'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete vehicle master record?"
        description={
          deleteTarget
            ? `Permanently delete ${deleteTarget.registration_number || deleteTarget.chassis_vin || 'this record'}?`
            : undefined
        }
      />
    </div>
  );
};

export default VehicleMasterPanel;
