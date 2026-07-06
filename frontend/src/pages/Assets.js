import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, TrendingUp, Sparkles, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialFormData = () => ({
  vehicle_id: '',
  acquisition_date: new Date().toISOString().split('T')[0],
  acquisition_cost: 0,
  currency: 'GHS',
  depreciation_rate: 0.15,
});

const assetToFormData = (asset) => ({
  vehicle_id: asset.vehicle_id,
  acquisition_date: new Date(asset.acquisition_date).toISOString().split('T')[0],
  acquisition_cost: asset.acquisition_cost,
  currency: asset.currency,
  depreciation_rate: asset.depreciation_rate,
});

const Assets = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'asset');

  const [assets, setAssets] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [predicting, setPredicting] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState(createInitialFormData);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [assetsRes, vehiclesRes] = await Promise.all([
        axios.get(`${API}/assets`),
        axios.get(`${API}/vehicles`),
      ]);
      setAssets(assetsRes.data);
      setVehicles(vehiclesRes.data);
    } catch (error) {
      toast.error('Failed to load assets');
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

  const openEditDialog = (asset) => {
    setEditingId(asset.id);
    setFormData(assetToFormData(asset));
    setDialogOpen(true);
  };

  const buildPayload = () => ({
    ...formData,
    acquisition_date: new Date(formData.acquisition_date).toISOString(),
    acquisition_cost: parseFloat(formData.acquisition_cost),
    depreciation_rate: parseFloat(formData.depreciation_rate),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/assets/${editingId}`, buildPayload())
          : axios.post(`${API}/assets`, buildPayload()),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: createInitialFormData,
      onSuccess: fetchData,
      successMessage: editingId ? 'Asset updated successfully!' : 'Asset added successfully!',
      errorMessage: editingId ? 'Failed to update asset' : 'Failed to add asset',
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/assets/${deleteTarget.id}`);
      toast.success('Asset deleted');
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete asset');
    } finally {
      setDeleting(false);
    }
  };

  const predictResaleValue = async () => {
    if (!selectedAsset) {
      toast.error('Please select an asset');
      return;
    }
    setPredicting(true);
    try {
      const response = await axios.post(`${API}/assets/${selectedAsset}/predict-resale`);
      toast.success(
        <div>
          <p className="font-semibold">AI Prediction Complete</p>
          <p className="text-sm mt-1">Predicted Value: ${response.data.predicted_value_usd?.toLocaleString()}</p>
          <p className="text-xs mt-1">Market Demand: {response.data.market_demand}</p>
        </div>
      );
      fetchData();
    } catch (error) {
      toast.error('Prediction failed');
    } finally {
      setPredicting(false);
    }
  };

  return (
    <div className="p-6 lg:p-8" data-testid="assets-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Asset Lifecycle</h1>
          <p className="text-slate-600 mt-1">Track asset value and predict resale prices</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="predict-resale-btn">
                  <Sparkles size={18} className="mr-2" />
                  Predict Resale
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>AI Resale Value Prediction</DialogTitle>
                  <DialogDescription>Select an asset to predict its market resale value using AI.</DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Select Asset</Label>
                    <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                      <SelectTrigger>
                        <SelectValue placeholder="Choose an asset" />
                      </SelectTrigger>
                      <SelectContent>
                        {assets.map(asset => {
                          const vehicle = vehicles.find(v => v.id === asset.vehicle_id);
                          return (
                            <SelectItem key={asset.id} value={asset.id}>
                              {vehicle?.registration_number} - {vehicle?.make} {vehicle?.model}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button onClick={predictResaleValue} disabled={predicting} className="w-full">
                    {predicting ? 'Analyzing...' : 'Predict Resale Value'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}

          {canEdit && (
            <Button data-testid="add-asset-btn" onClick={openCreateDialog}>
              <Plus size={18} className="mr-2" />
              Add Asset
            </Button>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Asset' : 'Add Asset'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update asset lifecycle details.' : 'Register a new vehicle asset to track its lifecycle and value.'}
            </DialogDescription>
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
              <Label>Acquisition Date</Label>
              <Input type="date" value={formData.acquisition_date} onChange={(e) => setFormData({...formData, acquisition_date: e.target.value})} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Acquisition Cost</Label>
                <Input type="number" step="0.01" value={formData.acquisition_cost} onChange={(e) => setFormData({...formData, acquisition_cost: e.target.value})} required />
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
              <Label>Depreciation Rate (annual %)</Label>
              <Input type="number" step="0.01" min="0" max="1" value={formData.depreciation_rate} onChange={(e) => setFormData({...formData, depreciation_rate: e.target.value})} />
              <p className="text-xs text-slate-500 mt-1">Default: 0.15 (15% per year)</p>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
              <Button type="submit">{editingId ? 'Save Changes' : 'Add Asset'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete asset?"
        description="Permanently delete this asset record? This cannot be undone."
        onConfirm={handleDelete}
        loading={deleting}
      />

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Acquisition Date</th>
              <th>Acquisition Cost (USD)</th>
              <th>Current Value (USD)</th>
              <th>Depreciation Rate</th>
              <th>Predicted Resale (USD)</th>
              <th>Status</th>
              {(canEdit || canDelete) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {assets.length === 0 ? (
              <tr>
                <td colSpan={(canEdit || canDelete) ? 8 : 7} className="text-center py-8 text-slate-500">No assets tracked</td>
              </tr>
            ) : (
              assets.map((asset) => {
                const vehicle = vehicles.find(v => v.id === asset.vehicle_id);
                return (
                  <tr key={asset.id}>
                    <td className="font-semibold">
                      {vehicle?.registration_number}<br />
                      <span className="text-xs text-slate-500">{vehicle?.make} {vehicle?.model}</span>
                    </td>
                    <td>{new Date(asset.acquisition_date).toLocaleDateString()}</td>
                    <td>${asset.acquisition_cost_usd.toLocaleString()}</td>
                    <td className="font-semibold">${asset.current_value_usd.toLocaleString()}</td>
                    <td>{(asset.depreciation_rate * 100).toFixed(0)}%</td>
                    <td>
                      {asset.predicted_resale_value ? (
                        <div className="flex items-center gap-1">
                          <TrendingUp size={14} className="text-green-600" />
                          <span className="font-semibold">${asset.predicted_resale_value.toLocaleString()}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                    <td>
                      {asset.disposal_date ? (
                        <span className="status-badge inactive">Disposed</span>
                      ) : (
                        <span className="status-badge active">Active</span>
                      )}
                    </td>
                    {(canEdit || canDelete) && (
                      <td>
                        <div className="flex gap-1">
                          {canEdit && (
                            <Button variant="ghost" size="icon" onClick={() => openEditDialog(asset)} aria-label="Edit asset">
                              <Pencil size={16} />
                            </Button>
                          )}
                          {canDelete && (
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(asset)} aria-label="Delete asset">
                              <Trash2 size={16} className="text-red-600" />
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
    </div>
  );
};

export default Assets;
