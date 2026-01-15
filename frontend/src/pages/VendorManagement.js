import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Star, Phone, Mail, Building } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const CATEGORIES = [
  { value: 'FUEL', label: 'Fuel Supplier' },
  { value: 'PARTS', label: 'Parts & Spares' },
  { value: 'TIRES', label: 'Tires' },
  { value: 'MAINTENANCE', label: 'Maintenance/Workshop' },
  { value: 'INSURANCE', label: 'Insurance' },
  { value: 'OTHER', label: 'Other' },
];

const VendorManagement = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    category: 'PARTS',
    country: 'GHANA',
    address: '',
    city: '',
    contact_person: '',
    phone: '',
    email: '',
    tax_id: '',
    payment_terms: 'NET30',
    is_preferred: false,
    currency: 'GHS',
    notes: '',
  });

  useEffect(() => {
    fetchVendors();
  }, []);

  const fetchVendors = async () => {
    try {
      const response = await axios.get(`${API}/vendors`);
      setVendors(response.data);
    } catch (error) {
      toast.error('Failed to load vendors');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/vendors`, formData);
      toast.success('Vendor added successfully!');
      setDialogOpen(false);
      fetchVendors();
      setFormData({
        name: '',
        category: 'PARTS',
        country: 'GHANA',
        address: '',
        city: '',
        contact_person: '',
        phone: '',
        email: '',
        tax_id: '',
        payment_terms: 'NET30',
        is_preferred: false,
        currency: 'GHS',
        notes: '',
      });
    } catch (error) {
      toast.error('Failed to add vendor');
    }
  };

  const togglePreferred = async (vendorId, currentStatus) => {
    try {
      await axios.put(`${API}/vendors/${vendorId}`, { is_preferred: !currentStatus });
      toast.success(currentStatus ? 'Removed from preferred' : 'Marked as preferred');
      fetchVendors();
    } catch (error) {
      toast.error('Failed to update vendor');
    }
  };

  const filteredVendors = vendors.filter(v => {
    if (selectedCategory && v.category !== selectedCategory) return false;
    if (selectedCountry && v.country !== selectedCountry) return false;
    return true;
  });

  const preferredVendors = vendors.filter(v => v.is_preferred);

  return (
    <div className="p-6 lg:p-8" data-testid="vendor-management-page">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Vendor Management</h1>
          <p className="text-slate-600 mt-1">Manage suppliers and service providers</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedCategory || "ALL"} onValueChange={(v) => setSelectedCategory(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Categories</SelectItem>
              {CATEGORIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={selectedCountry || "ALL"} onValueChange={(v) => setSelectedCountry(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="All Countries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Countries</SelectItem>
              <SelectItem value="GHANA">Ghana</SelectItem>
              <SelectItem value="LIBERIA">Liberia</SelectItem>
              <SelectItem value="SAO_TOME">São Tomé</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="add-vendor-btn">
                <Plus size={18} className="mr-2" />
                Add Vendor
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Add New Vendor</DialogTitle>
                <DialogDescription>Register a new supplier or service provider.</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Company Name *</Label>
                  <Input value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Category *</Label>
                    <Select value={formData.category} onValueChange={(value) => setFormData({...formData, category: value})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CATEGORIES.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Country *</Label>
                    <Select value={formData.country} onValueChange={(value) => setFormData({...formData, country: value})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHANA">Ghana</SelectItem>
                        <SelectItem value="LIBERIA">Liberia</SelectItem>
                        <SelectItem value="SAO_TOME">São Tomé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Address *</Label>
                    <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} required />
                  </div>
                  <div>
                    <Label>City *</Label>
                    <Input value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Contact Person *</Label>
                    <Input value={formData.contact_person} onChange={(e) => setFormData({...formData, contact_person: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Phone *</Label>
                    <Input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} />
                  </div>
                  <div>
                    <Label>Tax ID</Label>
                    <Input value={formData.tax_id} onChange={(e) => setFormData({...formData, tax_id: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Payment Terms</Label>
                    <Select value={formData.payment_terms} onValueChange={(value) => setFormData({...formData, payment_terms: value})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="COD">Cash on Delivery</SelectItem>
                        <SelectItem value="NET15">Net 15 Days</SelectItem>
                        <SelectItem value="NET30">Net 30 Days</SelectItem>
                        <SelectItem value="NET60">Net 60 Days</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Select value={formData.currency} onValueChange={(value) => setFormData({...formData, currency: value})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="GHS">GHS</SelectItem>
                        <SelectItem value="USD">USD</SelectItem>
                        <SelectItem value="LRD">LRD</SelectItem>
                        <SelectItem value="STN">STN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Notes</Label>
                  <Textarea value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Add Vendor</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Total Vendors</p>
          <p className="text-2xl font-bold text-slate-800">{vendors.length}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Preferred</p>
          <p className="text-2xl font-bold text-amber-600">{preferredVendors.length}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Categories</p>
          <p className="text-2xl font-bold text-blue-600">{new Set(vendors.map(v => v.category)).size}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Countries</p>
          <p className="text-2xl font-bold text-green-600">{new Set(vendors.map(v => v.country)).size}</p>
        </div>
      </div>

      {/* Preferred Vendors */}
      {preferredVendors.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <Star size={20} className="text-amber-500 fill-amber-500" />
            Preferred Vendors
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {preferredVendors.map(vendor => (
              <div key={vendor.id} className="fleet-card border-l-4 border-amber-400">
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold">{vendor.name}</h3>
                  <Star size={18} className="text-amber-500 fill-amber-500 cursor-pointer" onClick={() => togglePreferred(vendor.id, true)} />
                </div>
                <p className="text-sm text-slate-500">{CATEGORIES.find(c => c.value === vendor.category)?.label}</p>
                <div className="flex items-center gap-2 mt-2 text-sm text-slate-600">
                  <Phone size={14} />
                  {vendor.phone}
                </div>
                <span className="country-badge ghana mt-2 inline-block">{vendor.country}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All Vendors Table */}
      <div className="fleet-card">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">All Vendors</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Contact</th>
                <th>Location</th>
                <th>Payment</th>
                <th>Country</th>
                <th>Preferred</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.length === 0 ? (
                <tr>
                  <td colSpan="7" className="text-center py-8 text-slate-500">No vendors found</td>
                </tr>
              ) : (
                filteredVendors.map(vendor => (
                  <tr key={vendor.id}>
                    <td>
                      <div className="font-semibold">{vendor.name}</div>
                      {vendor.tax_id && <div className="text-xs text-slate-500">Tax: {vendor.tax_id}</div>}
                    </td>
                    <td>
                      <span className="status-badge bg-blue-100 text-blue-800">
                        {CATEGORIES.find(c => c.value === vendor.category)?.label}
                      </span>
                    </td>
                    <td>
                      <div className="text-sm">
                        <div className="font-medium">{vendor.contact_person}</div>
                        <div className="flex items-center gap-1 text-slate-500">
                          <Phone size={12} /> {vendor.phone}
                        </div>
                        {vendor.email && (
                          <div className="flex items-center gap-1 text-slate-500">
                            <Mail size={12} /> {vendor.email}
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="text-sm">
                        <div>{vendor.address}</div>
                        <div className="text-slate-500">{vendor.city}</div>
                      </div>
                    </td>
                    <td>{vendor.payment_terms}</td>
                    <td><span className="country-badge ghana">{vendor.country}</span></td>
                    <td>
                      <Star
                        size={20}
                        className={`cursor-pointer ${vendor.is_preferred ? 'text-amber-500 fill-amber-500' : 'text-slate-300'}`}
                        onClick={() => togglePreferred(vendor.id, vendor.is_preferred)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default VendorManagement;
