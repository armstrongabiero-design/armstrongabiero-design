import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import CountrySelect, { DEFAULT_COUNTRY_CODE, getCountryBadgeClass, getCountryLabel, normalizeCountryCode } from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialFormData = () => ({
  country: DEFAULT_COUNTRY_CODE,
  category: '',
  description: '',
  amount: 0,
  currency: 'GHS',
  date: new Date().toISOString().split('T')[0],
});

const expenditureToFormData = (exp) => ({
  country: normalizeCountryCode(exp.country),
  category: exp.category,
  description: exp.description,
  amount: exp.amount,
  currency: exp.currency,
  date: new Date(exp.date).toISOString().split('T')[0],
});

const Expenditures = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'expenditure');

  const [expenditures, setExpenditures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState(createInitialFormData);

  useEffect(() => {
    fetchExpenditures();
  }, []);

  const fetchExpenditures = async () => {
    try {
      const response = await axios.get(`${API}/expenditures`);
      setExpenditures(response.data);
    } catch (error) {
      toast.error('Failed to load expenditures');
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

  const openEditDialog = (exp) => {
    setEditingId(exp.id);
    setFormData(expenditureToFormData(exp));
    setDialogOpen(true);
  };

  const buildPayload = () => ({
    ...formData,
    date: new Date(formData.date).toISOString(),
    amount: parseFloat(formData.amount),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/expenditures/${editingId}`, buildPayload())
          : axios.post(`${API}/expenditures`, buildPayload()),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: createInitialFormData,
      onSuccess: fetchExpenditures,
      successMessage: editingId ? 'Expenditure updated!' : 'Expenditure recorded!',
      errorMessage: editingId ? 'Failed to update expenditure' : 'Failed to record expenditure',
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/expenditures/${deleteTarget.id}`);
      toast.success('Expenditure deleted');
      setDeleteTarget(null);
      fetchExpenditures();
    } catch {
      toast.error('Failed to delete expenditure');
    } finally {
      setDeleting(false);
    }
  };

  const totalUSD = expenditures.reduce((sum, exp) => sum + exp.amount_usd, 0);

  return (
    <div className="p-6 lg:p-8" data-testid="expenditures-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Expenditures</h1>
          <p className="text-slate-600 mt-1">Track all fleet expenses with multi-currency support</p>
        </div>
        {canEdit && (
          <Button data-testid="add-expenditure-btn" onClick={openCreateDialog}>
            <Plus size={18} className="mr-2" />
            Add Expenditure
          </Button>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Expenditure' : 'Record Expenditure'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update expenditure details.' : 'Log a new fleet expense with multi-currency support.'}
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
            <div>
              <Label>Category</Label>
              <Input value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} placeholder="e.g., Repairs, Tolls, Parking" required />
            </div>
            <div>
              <Label>Description</Label>
              <Input value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} required />
            </div>
            <div>
              <Label>Date</Label>
              <Input type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Amount</Label>
                <Input type="number" step="0.01" value={formData.amount} onChange={(e) => setFormData({...formData, amount: e.target.value})} required />
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
            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
              <Button type="submit">{editingId ? 'Save Changes' : 'Record'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete expenditure?"
        description={deleteTarget ? `Permanently delete "${deleteTarget.description}"? This cannot be undone.` : ''}
        onConfirm={handleDelete}
        loading={deleting}
      />

      <div className="fleet-card mb-6">
        <h3 className="text-lg font-semibold text-slate-800 mb-2">Total Expenditure</h3>
        <p className="text-3xl font-bold text-amber-600">${totalUSD.toLocaleString()}</p>
        <p className="text-sm text-slate-500 mt-1">USD equivalent</p>
      </div>

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Country</th>
              <th>Category</th>
              <th>Description</th>
              <th>Amount (Local)</th>
              <th>Amount (USD)</th>
              {(canEdit || canDelete) && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {expenditures.length === 0 ? (
              <tr>
                <td colSpan={(canEdit || canDelete) ? 7 : 6} className="text-center py-8 text-slate-500">No expenditures recorded</td>
              </tr>
            ) : (
              expenditures.map((exp) => (
                <tr key={exp.id}>
                  <td>{new Date(exp.date).toLocaleDateString()}</td>
                  <td><span className={getCountryBadgeClass(exp.country)}>{getCountryLabel(exp.country)}</span></td>
                  <td className="font-semibold">{exp.category}</td>
                  <td className="text-sm">{exp.description}</td>
                  <td>{exp.amount.toLocaleString()} {exp.currency}</td>
                  <td className="font-semibold">${exp.amount_usd.toLocaleString()}</td>
                  {(canEdit || canDelete) && (
                    <td>
                      <div className="flex gap-1">
                        {canEdit && (
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(exp)} aria-label="Edit expenditure">
                            <Pencil size={16} />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(exp)} aria-label="Delete expenditure">
                            <Trash2 size={16} className="text-red-600" />
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
    </div>
  );
};

export default Expenditures;
