import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Expenditures = () => {
  const [expenditures, setExpenditures] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    country: 'GHANA',
    category: '',
    description: '',
    amount: 0,
    currency: 'GHS',
    date: new Date().toISOString().split('T')[0],
  });

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/expenditures`, {
        ...formData,
        date: new Date(formData.date).toISOString(),
        amount: parseFloat(formData.amount),
      });
      toast.success('Expenditure recorded!');
      setDialogOpen(false);
      fetchExpenditures();
    } catch (error) {
      toast.error('Failed to record expenditure');
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
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-expenditure-btn">
              <Plus size={18} className="mr-2" />
              Add Expenditure
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Expenditure</DialogTitle>
              <DialogDescription>Log a new fleet expense with multi-currency support.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
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
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit">Record</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

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
            </tr>
          </thead>
          <tbody>
            {expenditures.length === 0 ? (
              <tr>
                <td colSpan="6" className="text-center py-8 text-slate-500">No expenditures recorded</td>
              </tr>
            ) : (
              expenditures.map((exp) => (
                <tr key={exp.id}>
                  <td>{new Date(exp.date).toLocaleDateString()}</td>
                  <td><span className="country-badge ghana">{exp.country.replace('_', ' ')}</span></td>
                  <td className="font-semibold">{exp.category}</td>
                  <td className="text-sm">{exp.description}</td>
                  <td>{exp.amount.toLocaleString()} {exp.currency}</td>
                  <td className="font-semibold">${exp.amount_usd.toLocaleString()}</td>
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
