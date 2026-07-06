import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Package, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import CountrySelect, { DEFAULT_COUNTRY_CODE, getCountryBadgeClass, getCountryLabel, normalizeCountryCode } from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditFleetRecord, canHardDelete } from '../utils/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialFormData = () => ({
  name: '',
  sku: '',
  category: '',
  country: DEFAULT_COUNTRY_CODE,
  location: '',
  quantity: 0,
  reorder_level: 10,
  unit_cost: 0,
  currency: 'GHS',
  lead_time_days: 7,
});

const itemToFormData = (item) => ({
  name: item.name,
  sku: item.sku,
  category: item.category,
  country: normalizeCountryCode(item.country),
  location: item.location,
  quantity: item.quantity,
  reorder_level: item.reorder_level,
  unit_cost: item.unit_cost,
  currency: item.currency,
  lead_time_days: item.lead_time_days,
});

const Inventory = () => {
  const { user } = useAuth();
  const canEdit = canEditFleetRecord(user?.role);
  const canDelete = canHardDelete(user?.role, 'inventory_item');

  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [formData, setFormData] = useState(createInitialFormData);

  const [txnFormData, setTxnFormData] = useState({
    item_id: '',
    transaction_type: 'PURCHASE',
    quantity: 0,
    notes: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [itemsRes, txnRes] = await Promise.all([
        axios.get(`${API}/inventory`),
        axios.get(`${API}/inventory/transactions`),
      ]);
      setItems(itemsRes.data);
      setTransactions(txnRes.data);
    } catch (error) {
      toast.error('Failed to load inventory');
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

  const openEditDialog = (item) => {
    setEditingId(item.id);
    setFormData(itemToFormData(item));
    setDialogOpen(true);
  };

  const buildPayload = () => ({
    ...formData,
    quantity: parseInt(formData.quantity, 10),
    reorder_level: parseInt(formData.reorder_level, 10),
    unit_cost: parseFloat(formData.unit_cost),
    lead_time_days: parseInt(formData.lead_time_days, 10),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    await completeDialogSubmit({
      submit: () =>
        editingId
          ? axios.put(`${API}/inventory/${editingId}`, buildPayload())
          : axios.post(`${API}/inventory`, buildPayload()),
      setDialogOpen: handleDialogOpenChange,
      setFormData,
      initialFormData: createInitialFormData,
      onSuccess: fetchData,
      successMessage: editingId ? 'Item updated successfully!' : 'Item added successfully!',
      errorMessage: editingId ? 'Failed to update item' : 'Failed to add item',
    });
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await axios.delete(`${API}/inventory/${deleteTarget.id}`);
      toast.success('Item deleted');
      setDeleteTarget(null);
      fetchData();
    } catch {
      toast.error('Failed to delete item');
    } finally {
      setDeleting(false);
    }
  };

  const handleTransactionSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/inventory/transactions`, {
        ...txnFormData,
        quantity: parseInt(txnFormData.quantity),
      });
      toast.success('Transaction recorded!');
      setTxnDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Transaction failed');
    }
  };

  const lowStockItems = items.filter(item => item.quantity <= item.reorder_level);

  return (
    <div className="p-6 lg:p-8" data-testid="inventory-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Inventory</h1>
          <p className="text-slate-600 mt-1">Manage parts and supplies across locations</p>
        </div>
        <div className="flex gap-2">
          {canEdit && (
            <Dialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen}>
              <Button variant="outline" data-testid="record-transaction-btn" onClick={() => setTxnDialogOpen(true)}>
                <Package size={18} className="mr-2" />
                Transaction
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Record Transaction</DialogTitle>
                  <DialogDescription>Log an inventory transaction (purchase, usage, transfer, or adjustment).</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleTransactionSubmit} className="space-y-4">
                  <div>
                    <Label>Item</Label>
                    <Select value={txnFormData.item_id} onValueChange={(value) => setTxnFormData({...txnFormData, item_id: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select item" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map(item => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.name} ({item.sku})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Type</Label>
                    <Select value={txnFormData.transaction_type} onValueChange={(value) => setTxnFormData({...txnFormData, transaction_type: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PURCHASE">Purchase</SelectItem>
                        <SelectItem value="USAGE">Usage</SelectItem>
                        <SelectItem value="TRANSFER">Transfer</SelectItem>
                        <SelectItem value="ADJUSTMENT">Adjustment</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Quantity</Label>
                    <Input type="number" value={txnFormData.quantity} onChange={(e) => setTxnFormData({...txnFormData, quantity: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Input value={txnFormData.notes} onChange={(e) => setTxnFormData({...txnFormData, notes: e.target.value})} />
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <Button type="button" variant="outline" onClick={() => setTxnDialogOpen(false)}>Cancel</Button>
                    <Button type="submit">Record</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}

          {canEdit && (
            <Button data-testid="add-item-btn" onClick={openCreateDialog}>
              <Plus size={18} className="mr-2" />
              Add Item
            </Button>
          )}
        </div>
      </div>

      {lowStockItems.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <AlertTriangle className="text-amber-600" size={20} />
          <div>
            <p className="font-semibold text-amber-800">Low Stock Alert</p>
            <p className="text-sm text-amber-700">{lowStockItems.length} items below reorder level</p>
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Inventory Item' : 'Add Inventory Item'}</DialogTitle>
            <DialogDescription>
              {editingId ? 'Update item details.' : 'Add a new part or supply to track in inventory.'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Name</Label>
                <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
              </div>
              <div>
                <Label>SKU</Label>
                <Input value={formData.sku} onChange={(e) => setFormData({...formData, sku: e.target.value})} required />
              </div>
            </div>
            <div>
              <Label>Category</Label>
              <Input value={formData.category} onChange={(e) => setFormData({...formData, category: e.target.value})} required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Country</Label>
                <CountrySelect
                  value={formData.country}
                  onValueChange={(value) => setFormData({ ...formData, country: value })}
                />
              </div>
              <div>
                <Label>Location</Label>
                <Input value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} required />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{editingId ? 'Quantity' : 'Initial Quantity'}</Label>
                <Input type="number" value={formData.quantity} onChange={(e) => setFormData({...formData, quantity: e.target.value})} />
              </div>
              <div>
                <Label>Reorder Level</Label>
                <Input type="number" value={formData.reorder_level} onChange={(e) => setFormData({...formData, reorder_level: e.target.value})} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Unit Cost</Label>
                <Input type="number" step="0.01" value={formData.unit_cost} onChange={(e) => setFormData({...formData, unit_cost: e.target.value})} required />
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
              <div>
                <Label>Lead Time (days)</Label>
                <Input type="number" value={formData.lead_time_days} onChange={(e) => setFormData({...formData, lead_time_days: e.target.value})} />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <Button type="button" variant="outline" onClick={() => handleDialogOpenChange(false)}>Cancel</Button>
              <Button type="submit">{editingId ? 'Save Changes' : 'Add Item'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete inventory item?"
        description={deleteTarget ? `Permanently delete "${deleteTarget.name}" (${deleteTarget.sku})? This cannot be undone.` : ''}
        onConfirm={handleDelete}
        loading={deleting}
      />

      <Tabs defaultValue="items" className="w-full">
        <TabsList>
          <TabsTrigger value="items" data-testid="items-tab">Items</TabsTrigger>
          <TabsTrigger value="transactions" data-testid="transactions-tab">Transactions</TabsTrigger>
        </TabsList>

        <TabsContent value="items">
          <div className="fleet-card table-container mt-4">
            <table>
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Country</th>
                  <th>Location</th>
                  <th>Quantity</th>
                  <th>Reorder Level</th>
                  <th>Unit Cost (USD)</th>
                  {(canEdit || canDelete) && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={(canEdit || canDelete) ? 9 : 8} className="text-center py-8 text-slate-500">No items in inventory</td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className={item.quantity <= item.reorder_level ? 'bg-amber-50' : ''}>
                      <td className="font-mono text-sm">{item.sku}</td>
                      <td className="font-semibold">{item.name}</td>
                      <td>{item.category}</td>
                      <td><span className={getCountryBadgeClass(item.country)}>{getCountryLabel(item.country)}</span></td>
                      <td>{item.location}</td>
                      <td className="font-semibold">{item.quantity}</td>
                      <td>{item.reorder_level}</td>
                      <td>${item.unit_cost_usd}</td>
                      {(canEdit || canDelete) && (
                        <td>
                          <div className="flex gap-1">
                            {canEdit && (
                              <Button variant="ghost" size="icon" onClick={() => openEditDialog(item)} aria-label="Edit item">
                                <Pencil size={16} />
                              </Button>
                            )}
                            {canDelete && (
                              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(item)} aria-label="Delete item">
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
        </TabsContent>

        <TabsContent value="transactions">
          <div className="fleet-card table-container mt-4">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Item</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="text-center py-8 text-slate-500">No transactions</td>
                  </tr>
                ) : (
                  transactions.map((txn) => {
                    const item = items.find(i => i.id === txn.item_id);
                    return (
                      <tr key={txn.id}>
                        <td>{new Date(txn.created_at).toLocaleDateString()}</td>
                        <td className="font-semibold">{item?.name || 'N/A'}</td>
                        <td><span className="status-badge">{txn.transaction_type}</span></td>
                        <td>{txn.quantity}</td>
                        <td className="text-sm">{txn.notes || '-'}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Inventory;
