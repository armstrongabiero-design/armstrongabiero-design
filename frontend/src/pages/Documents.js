import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Plus, Upload, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Documents = () => {
  const [documents, setDocuments] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);

  const [formData, setFormData] = useState({
    country: 'GHANA',
    document_type: 'ROADWORTHY_CERT',
    entity_id: '',
    entity_type: 'VEHICLE',
    document_number: '',
    issue_date: new Date().toISOString().split('T')[0],
    expiry_date: new Date(Date.now() + 365*24*60*60*1000).toISOString().split('T')[0],
    file_url: '',
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [docsRes, vehiclesRes, driversRes] = await Promise.all([
        axios.get(`${API}/documents`),
        axios.get(`${API}/vehicles`),
        axios.get(`${API}/drivers`),
      ]);
      setDocuments(docsRes.data);
      setVehicles(vehiclesRes.data);
      setDrivers(driversRes.data);
    } catch (error) {
      toast.error('Failed to load documents');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await axios.post(`${API}/documents`, {
        ...formData,
        issue_date: new Date(formData.issue_date).toISOString(),
        expiry_date: new Date(formData.expiry_date).toISOString(),
      });
      toast.success('Document added successfully!');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to add document');
    }
  };

  const getDocumentTypeLabel = (type) => {
    const labels = {
      ROADWORTHY_CERT: 'Roadworthy Certificate',
      INSURANCE: 'Insurance',
      DRIVER_LICENSE: 'Driver License',
      VEHICLE_REGISTRATION: 'Registration',
      OTHER: 'Other',
    };
    return labels[type] || type;
  };

  return (
    <div className="p-6 lg:p-8" data-testid="documents-page">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Documents</h1>
          <p className="text-slate-600 mt-1">Manage compliance documents with AI OCR</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button data-testid="add-document-btn">
              <Plus size={18} className="mr-2" />
              Add Document
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Document</DialogTitle>
              <DialogDescription>Upload a compliance document for a vehicle or driver.</DialogDescription>
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
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Document Type</Label>
                  <Select value={formData.document_type} onValueChange={(value) => setFormData({...formData, document_type: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ROADWORTHY_CERT">Roadworthy Cert</SelectItem>
                      <SelectItem value="INSURANCE">Insurance</SelectItem>
                      <SelectItem value="DRIVER_LICENSE">Driver License</SelectItem>
                      <SelectItem value="VEHICLE_REGISTRATION">Registration</SelectItem>
                      <SelectItem value="OTHER">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Entity Type</Label>
                  <Select value={formData.entity_type} onValueChange={(value) => setFormData({...formData, entity_type: value, entity_id: ''})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="VEHICLE">Vehicle</SelectItem>
                      <SelectItem value="DRIVER">Driver</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>{formData.entity_type === 'VEHICLE' ? 'Vehicle' : 'Driver'}</Label>
                <Select value={formData.entity_id} onValueChange={(value) => setFormData({...formData, entity_id: value})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {formData.entity_type === 'VEHICLE' ? (
                      vehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.registration_number} - {v.make} {v.model}
                        </SelectItem>
                      ))
                    ) : (
                      drivers.map(d => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.first_name} {d.last_name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Document Number</Label>
                <Input value={formData.document_number} onChange={(e) => setFormData({...formData, document_number: e.target.value})} required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Issue Date</Label>
                  <Input type="date" value={formData.issue_date} onChange={(e) => setFormData({...formData, issue_date: e.target.value})} required />
                </div>
                <div>
                  <Label>Expiry Date</Label>
                  <Input type="date" value={formData.expiry_date} onChange={(e) => setFormData({...formData, expiry_date: e.target.value})} required />
                </div>
              </div>
              <div>
                <Label>File URL</Label>
                <Input value={formData.file_url} onChange={(e) => setFormData({...formData, file_url: e.target.value})} placeholder="https://..." required />
              </div>
              <div className="flex justify-end gap-2 mt-6">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit">Add Document</Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Sparkles className="text-amber-600" size={20} />
        <div>
          <p className="font-semibold text-purple-800">AI OCR Available</p>
          <p className="text-sm text-amber-700">Upload documents for automatic data extraction and validation</p>
        </div>
      </div>

      <div className="fleet-card table-container">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Entity</th>
              <th>Document #</th>
              <th>Country</th>
              <th>Issue Date</th>
              <th>Expiry Date</th>
              <th>OCR Status</th>
              <th>Valid</th>
            </tr>
          </thead>
          <tbody>
            {documents.length === 0 ? (
              <tr>
                <td colSpan="8" className="text-center py-8 text-slate-500">No documents found</td>
              </tr>
            ) : (
              documents.map((doc) => {
                const entity = doc.entity_type === 'VEHICLE' 
                  ? vehicles.find(v => v.id === doc.entity_id)
                  : drivers.find(d => d.id === doc.entity_id);
                const isExpired = new Date(doc.expiry_date) < new Date();
                return (
                  <tr key={doc.id}>
                    <td><span className="status-badge">{getDocumentTypeLabel(doc.document_type)}</span></td>
                    <td className="font-semibold">
                      {doc.entity_type === 'VEHICLE' 
                        ? entity?.registration_number 
                        : `${entity?.first_name} ${entity?.last_name}`}
                    </td>
                    <td className="text-xs font-mono">{doc.document_number}</td>
                    <td><span className="country-badge ghana">{doc.country.replace('_', ' ')}</span></td>
                    <td>{new Date(doc.issue_date).toLocaleDateString()}</td>
                    <td className={isExpired ? 'text-red-600 font-semibold' : ''}>
                      {new Date(doc.expiry_date).toLocaleDateString()}
                    </td>
                    <td>
                      {doc.ocr_processed ? (
                        <span className="status-badge active">Processed</span>
                      ) : (
                        <span className="status-badge inactive">Pending</span>
                      )}
                    </td>
                    <td>
                      {doc.validated ? (
                        <span className="status-badge active">Valid</span>
                      ) : isExpired ? (
                        <span className="status-badge maintenance">Expired</span>
                      ) : (
                        <span className="status-badge inactive">Unvalidated</span>
                      )}
                    </td>
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

export default Documents;
