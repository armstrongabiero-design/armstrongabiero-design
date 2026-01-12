import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Package, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Inventory = () => {
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [txnDialogOpen, setTxnDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    category: '',
    country: 'GHANA',
    location: '',
    quantity: 0,
    reorder_level: 10,
    unit_cost: 0,
    currency: 'GHS',
    lead_time_days: 7,
  });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/inventory`, {
        ...formData,
        quantity: parseInt(formData.quantity),
        reorder_level: parseInt(formData.reorder_level),
        unit_cost: parseFloat(formData.unit_cost),
        lead_time_days: parseInt(formData.lead_time_days),
      });
      toast.success('Item added successfully!');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to add item');
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
          <Dialog open={txnDialogOpen} onOpenChange={setTxnDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="record-transaction-btn">
                <Package size={18} className="mr-2" />
                Transaction
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Record Transaction</DialogTitle>
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

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-item-btn">
                <Plus size={18} className="mr-2" />
                Add Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Inventory Item</DialogTitle>
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
                    <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHANA">Ghana</SelectItem>
                        <SelectItem value="LIBERIA">Liberia</SelectItem>
                        <SelectItem value="SAO_TOME">São Tomé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input value={formData.location} onChange={(e) => setFormData({...formData, location: e.target.value})} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Initial Quantity</Label>
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
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Add Item</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
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
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan="8" className="text-center py-8 text-slate-500">No items in inventory</td>
                  </tr>
                ) : (
                  items.map((item) => (
                    <tr key={item.id} className={item.quantity <= item.reorder_level ? 'bg-amber-50' : ''}>
                      <td className="font-mono text-sm">{item.sku}</td>
                      <td className="font-semibold">{item.name}</td>
                      <td>{item.category}</td>
                      <td><span className="country-badge ghana">{item.country.replace('_', ' ')}</span></td>
                      <td>{item.location}</td>
                      <td className="font-semibold">{item.quantity}</td>
                      <td>{item.reorder_level}</td>
                      <td>${item.unit_cost_usd}</td>
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
