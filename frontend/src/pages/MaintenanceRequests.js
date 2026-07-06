import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Plus, Check, X, Clock, AlertTriangle, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Textarea } from '../components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import CountrySelect, { DEFAULT_COUNTRY_CODE, getCountryBadgeClass, getCountryLabel } from '../components/CountrySelect';
import ConfirmDeleteDialog from '../components/ConfirmDeleteDialog';
import { completeDialogSubmit } from '../utils/formUtils';
import { canEditMaintenanceRequest, canHardDelete } from '../utils/permissions';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const createInitialRequestForm = (user, isPersonalView) => ({
  vehicle_id: '',
  driver_id: isPersonalView ? (user?.driver_id || user?.id) : '',
  request_type: '',
  description: '',
  priority: 'MEDIUM',
  estimated_cost: '',
  currency: 'GHS',
});

const requestToFormData = (request) => ({
  vehicle_id: request.vehicle_id,
  driver_id: request.driver_id,
  request_type: request.request_type,
  description: request.description,
  priority: request.priority,
  estimated_cost: request.estimated_cost ?? '',
  currency: request.currency || 'GHS',
});

const MaintenanceRequests = () => {
  const { user, token, isDriverOrUser, isStaff } = useAuth();
  const isPersonalView = isDriverOrUser && isDriverOrUser();
  
  const [requests, setRequests] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [managers, setManagers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [approvalDialogOpen, setApprovalDialogOpen] = useState(false);
  const [managerDialogOpen, setManagerDialogOpen] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [activeTab, setActiveTab] = useState('PENDING');

  const [formData, setFormData] = useState({
    vehicle_id: '',
    driver_id: user?.id || '',
    request_type: '',
    description: '',
    priority: 'MEDIUM',
    estimated_cost: '',
    currency: 'GHS',
  });

  const [approvalData, setApprovalData] = useState({
    manager_id: '',
    approved: true,
    rejection_reason: '',
  });

  const [managerForm, setManagerForm] = useState({
    name: '',
    email: '',
    phone: '',
    country: DEFAULT_COUNTRY_CODE,
  });

  const fetchData = useCallback(async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      
      const requestsEndpoint = isPersonalView 
        ? `${API}/maintenance-requests?driver_id=${user?.id}`
        : `${API}/maintenance-requests`;
      
      const [requestsRes, vehiclesRes, driversRes, managersRes] = await Promise.all([
        axios.get(requestsEndpoint, { headers }),
        axios.get(`${API}/vehicles`, { headers }),
        axios.get(`${API}/drivers`, { headers }),
        axios.get(`${API}/fleet-managers`, { headers }),
      ]);
      
      let filteredRequests = requestsRes.data;
      if (isPersonalView) {
        filteredRequests = requestsRes.data.filter(r => r.driver_id === user?.id || r.driver_id === user?.driver_id);
      }
      
      setRequests(filteredRequests);
      setVehicles(vehiclesRes.data);
      setDrivers(driversRes.data);
      setManagers(managersRes.data);
      
      if (isPersonalView) {
        setFormData(prev => ({ ...prev, driver_id: user?.driver_id || user?.id }));
      }
    } catch {
      toast.error('Failed to load data');
    } finally {
      setLoading(false);
    }
  }, [token, isPersonalView, user]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRequestDialogChange = (open) => {
    setRequestDialogOpen(open);
    if (!open) {
      setEditingRequestId(null);
      setFormData(createInitialRequestForm(user, isPersonalView));
    }
  };

  const openCreateRequest = () => {
    setEditingRequestId(null);
    setFormData(createInitialRequestForm(user, isPersonalView));
    setRequestDialogOpen(true);
  };

  const openEditRequest = (request) => {
    setEditingRequestId(request.id);
    setFormData(requestToFormData(request));
    setRequestDialogOpen(true);
  };

  const handleSubmitRequest = async (e) => {
    e.preventDefault();
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const submitData = {
      ...formData,
      driver_id: isPersonalView ? (user?.driver_id || user?.id) : formData.driver_id,
      estimated_cost: formData.estimated_cost ? parseFloat(formData.estimated_cost) : null,
    };

    await completeDialogSubmit({
      submit: () =>
        editingRequestId
          ? axios.put(`${API}/maintenance-requests/${editingRequestId}`, submitData, { headers })
          : axios.post(`${API}/maintenance-requests`, submitData, { headers }),
      setDialogOpen: handleRequestDialogChange,
      setFormData,
      initialFormData: () => createInitialRequestForm(user, isPersonalView),
      onSuccess: fetchData,
      successMessage: editingRequestId ? 'Request updated!' : 'Maintenance request submitted! Fleet managers have been notified.',
      errorMessage: editingRequestId ? 'Failed to update request' : 'Failed to submit request',
    });
    setEditingRequestId(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.delete(`${API}/maintenance-requests/${deleteTarget.id}`, { headers });
      toast.success('Request deleted');
      setDeleteTarget(null);
      fetchData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to delete request');
    } finally {
      setDeleting(false);
    }
  };

  const handleApproval = async () => {
    if (!selectedRequest) return;
    
    if (!approvalData.approved && !approvalData.rejection_reason) {
      toast.error('Please provide a rejection reason');
      return;
    }

    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/maintenance-requests/${selectedRequest.id}/approve`, approvalData, { headers });
      toast.success(`Request ${approvalData.approved ? 'approved' : 'rejected'}! Driver has been notified.`);
      setApprovalDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to process request');
    }
  };

  const handleAddManager = async (e) => {
    e.preventDefault();
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/fleet-managers`, managerForm, { headers });
      toast.success('Fleet manager added successfully!');
      setManagerDialogOpen(false);
      fetchData();
      setManagerForm({ name: '', email: '', phone: '', country: DEFAULT_COUNTRY_CODE });
    } catch (error) {
      toast.error('Failed to add fleet manager');
    }
  };

  const openApprovalDialog = (request) => {
    setSelectedRequest(request);
    setApprovalData({ manager_id: managers[0]?.id || '', approved: true, rejection_reason: '' });
    setApprovalDialogOpen(true);
  };

  const getPriorityBadge = (priority) => {
    const badges = {
      LOW: 'bg-green-100 text-green-800',
      MEDIUM: 'bg-amber-100 text-amber-800',
      HIGH: 'bg-orange-100 text-orange-800',
      CRITICAL: 'bg-red-100 text-red-800',
    };
    return `status-badge ${badges[priority] || ''}`;
  };

  const getStatusBadge = (status) => {
    const badges = {
      PENDING: 'bg-amber-100 text-amber-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
      COMPLETED: 'bg-blue-100 text-blue-800',
    };
    return `status-badge ${badges[status] || ''}`;
  };

  const filteredRequests = requests.filter(r => r.status === activeTab);

  return (
    <div className="p-6 lg:p-8" data-testid="maintenance-requests-page">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            {isPersonalView ? 'My Requests' : 'Maintenance Requests'}
          </h1>
          <p className="text-slate-600 mt-1">
            {isPersonalView 
              ? 'View and submit your maintenance requests' 
              : 'Submit and manage maintenance authorization requests'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {/* Only show Add Manager for staff */}
          {!isPersonalView && (
            <Dialog open={managerDialogOpen} onOpenChange={setManagerDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" data-testid="add-manager-btn">
                  <Plus size={18} className="mr-2" />
                  Add Manager
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Fleet Manager</DialogTitle>
                  <DialogDescription>Register a fleet manager who can approve maintenance requests.</DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddManager} className="space-y-4">
                  <div>
                    <Label>Name</Label>
                    <Input value={managerForm.name} onChange={(e) => setManagerForm({...managerForm, name: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={managerForm.email} onChange={(e) => setManagerForm({...managerForm, email: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={managerForm.phone} onChange={(e) => setManagerForm({...managerForm, phone: e.target.value})} required />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <CountrySelect
                      value={managerForm.country}
                      onValueChange={(value) => setManagerForm({ ...managerForm, country: value })}
                    />
                  </div>
                  <div className="flex justify-end gap-2 mt-6">
                    <Button type="button" variant="outline" onClick={() => setManagerDialogOpen(false)}>Cancel</Button>
                    <Button type="submit">Add Manager</Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          )}

          <Dialog open={requestDialogOpen} onOpenChange={handleRequestDialogChange}>
            <DialogTrigger asChild>
              <Button data-testid="submit-request-btn" onClick={openCreateRequest}>
                <Plus size={18} className="mr-2" />
                {isPersonalView ? 'New Request' : 'Submit Request'}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingRequestId ? 'Edit Maintenance Request' : 'Submit Maintenance Request'}</DialogTitle>
                <DialogDescription>
                  {isPersonalView 
                    ? 'Request maintenance for your assigned vehicle.'
                    : 'Request authorization for vehicle maintenance from fleet manager.'}
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmitRequest} className="space-y-4">
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
                
                {/* Only show driver selection for staff, hide for drivers/users */}
                {!isPersonalView && (
                  <div>
                    <Label>Driver/Requestor</Label>
                    <Select value={formData.driver_id} onValueChange={(value) => setFormData({...formData, driver_id: value})}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select driver" />
                      </SelectTrigger>
                      <SelectContent>
                        {drivers.map(d => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.first_name} {d.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                
                {/* Show requestor info for personal view */}
                {isPersonalView && (
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <Label className="text-xs text-slate-500">Requestor</Label>
                    <p className="font-medium text-slate-800">{user?.full_name}</p>
                  </div>
                )}
                
                <div>
                  <Label>Request Type</Label>
                  <Input value={formData.request_type} onChange={(e) => setFormData({...formData, request_type: e.target.value})} placeholder="e.g., Oil Change, Brake Repair" required />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select value={formData.priority} onValueChange={(value) => setFormData({...formData, priority: value})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="LOW">Low</SelectItem>
                      <SelectItem value="MEDIUM">Medium</SelectItem>
                      <SelectItem value="HIGH">High</SelectItem>
                      <SelectItem value="CRITICAL">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={formData.description} onChange={(e) => setFormData({...formData, description: e.target.value})} placeholder="Describe the issue or maintenance needed..." required />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Estimated Cost (optional)</Label>
                    <Input type="number" step="0.01" value={formData.estimated_cost} onChange={(e) => setFormData({...formData, estimated_cost: e.target.value})} />
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
                  <Button type="button" variant="outline" onClick={() => handleRequestDialogChange(false)}>Cancel</Button>
                  <Button type="submit">{editingRequestId ? 'Save Changes' : 'Submit Request'}</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Approval Dialog - Only for staff */}
      {!isPersonalView && (
        <Dialog open={approvalDialogOpen} onOpenChange={setApprovalDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Process Request</DialogTitle>
              <DialogDescription>Approve or reject this maintenance request.</DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="bg-slate-50 p-4 rounded-lg">
                  <p><strong>Vehicle:</strong> {vehicles.find(v => v.id === selectedRequest.vehicle_id)?.registration_number}</p>
                  <p><strong>Type:</strong> {selectedRequest.request_type}</p>
                  <p><strong>Priority:</strong> <span className={getPriorityBadge(selectedRequest.priority)}>{selectedRequest.priority}</span></p>
                  <p><strong>Description:</strong> {selectedRequest.description}</p>
                </div>
                <div>
                  <Label>Approving Manager</Label>
                  <Select value={approvalData.manager_id} onValueChange={(value) => setApprovalData({...approvalData, manager_id: value})}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select manager" />
                    </SelectTrigger>
                    <SelectContent>
                      {managers.map(m => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Decision</Label>
                  <div className="flex gap-2 mt-2">
                    <Button 
                      type="button" 
                      variant={approvalData.approved ? "default" : "outline"}
                      onClick={() => setApprovalData({...approvalData, approved: true})}
                      className="flex-1"
                    >
                      <Check size={18} className="mr-2" /> Approve
                    </Button>
                    <Button 
                      type="button" 
                      variant={!approvalData.approved ? "destructive" : "outline"}
                      onClick={() => setApprovalData({...approvalData, approved: false})}
                      className="flex-1"
                    >
                      <X size={18} className="mr-2" /> Reject
                    </Button>
                  </div>
                </div>
                {!approvalData.approved && (
                  <div>
                    <Label>Rejection Reason *</Label>
                    <Textarea 
                      value={approvalData.rejection_reason} 
                      onChange={(e) => setApprovalData({...approvalData, rejection_reason: e.target.value})} 
                      placeholder="Explain why this request is being rejected..."
                      required
                    />
                  </div>
                )}
                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => setApprovalDialogOpen(false)}>Cancel</Button>
                  <Button onClick={handleApproval}>
                    {approvalData.approved ? 'Approve Request' : 'Reject Request'}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      )}

      {/* Pending Requests Alert - Only for staff */}
      {!isPersonalView && requests.filter(r => r.status === 'PENDING').length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <Clock className="text-amber-600" size={20} />
          <div>
            <p className="font-semibold text-amber-800">Pending Approvals</p>
            <p className="text-sm text-amber-700">{requests.filter(r => r.status === 'PENDING').length} requests awaiting manager approval</p>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="PENDING" data-testid="pending-tab">
            Pending ({requests.filter(r => r.status === 'PENDING').length})
          </TabsTrigger>
          <TabsTrigger value="APPROVED" data-testid="approved-tab">
            Approved ({requests.filter(r => r.status === 'APPROVED').length})
          </TabsTrigger>
          <TabsTrigger value="REJECTED" data-testid="rejected-tab">
            Rejected ({requests.filter(r => r.status === 'REJECTED').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <div className="fleet-card table-container mt-4">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vehicle</th>
                  {!isPersonalView && <th>Requestor</th>}
                  {!isPersonalView && <th>Submitted By</th>}
                  <th>Type</th>
                  <th>Priority</th>
                  <th>Description</th>
                  <th>Status</th>
                  {activeTab === 'PENDING' && <th className="w-32">Actions</th>}
                  {activeTab === 'REJECTED' && <th>Reason</th>}
                </tr>
              </thead>
              <tbody>
                {filteredRequests.length === 0 ? (
                  <tr>
                    <td colSpan={isPersonalView ? 7 : 10} className="text-center py-8 text-slate-500">
                      No {activeTab.toLowerCase()} requests
                    </td>
                  </tr>
                ) : (
                  filteredRequests.map((request) => {
                    const vehicle = vehicles.find(v => v.id === request.vehicle_id);
                    const driver = drivers.find(d => d.id === request.driver_id);
                    const wasSubmittedByOther = request.submitted_by_id && request.submitted_by_id !== request.driver_id;
                    return (
                      <tr key={request.id} data-testid={`request-row-${request.id}`}>
                        <td>{new Date(request.created_at).toLocaleDateString()}</td>
                        <td className="font-semibold">{vehicle?.registration_number || 'N/A'}</td>
                        {!isPersonalView && <td>{driver?.first_name} {driver?.last_name}</td>}
                        {!isPersonalView && (
                          <td>
                            {wasSubmittedByOther ? (
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-slate-700">{request.submitted_by_name}</span>
                                <span className="text-xs text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full w-fit">
                                  {request.submitted_by_role?.replace('_', ' ')}
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-sm">Self</span>
                            )}
                          </td>
                        )}
                        <td>{request.request_type}</td>
                        <td><span className={getPriorityBadge(request.priority)}>{request.priority}</span></td>
                        <td className="text-sm max-w-xs truncate">{request.description}</td>
                        <td><span className={getStatusBadge(request.status)}>{request.status}</span></td>
                        {activeTab === 'PENDING' && (
                          <td>
                            <div className="flex gap-1 items-center flex-wrap">
                              {activeTab === 'PENDING' && !isPersonalView && (
                                <Button size="sm" onClick={() => openApprovalDialog(request)}>
                                  Review
                                </Button>
                              )}
                              {canEditMaintenanceRequest(user?.role, isPersonalView, request) && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditRequest(request)}>
                                  <Pencil size={16} />
                                </Button>
                              )}
                              {canHardDelete(user?.role, 'maintenance_request') && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                                  onClick={() => setDeleteTarget(request)}
                                >
                                  <Trash2 size={16} />
                                </Button>
                              )}
                            </div>
                          </td>
                        )}
                        {activeTab === 'REJECTED' && (
                          <td className="text-sm text-red-600 max-w-xs truncate">{request.rejection_reason}</td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* Fleet Managers List - Only for staff */}
      {!isPersonalView && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">Fleet Managers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {managers.map(manager => (
              <div key={manager.id} className="fleet-card">
                <h3 className="font-semibold text-slate-800">{manager.name}</h3>
                <p className="text-sm text-slate-600">{manager.email}</p>
                <p className="text-sm text-slate-600">{manager.phone}</p>
                <span className={`${getCountryBadgeClass(manager.country)} mt-2 inline-block`}>{getCountryLabel(manager.country)}</span>
              </div>
            ))}
            {managers.length === 0 && (
              <p className="text-slate-500 col-span-full">No fleet managers registered. Add one to enable approvals.</p>
            )}
          </div>
        </div>
      )}

      <ConfirmDeleteDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handleConfirmDelete}
        loading={deleting}
        title="Delete maintenance request?"
        description={deleteTarget ? `Permanently delete this ${deleteTarget.request_type} request? This cannot be undone.` : undefined}
      />
    </div>
  );
};

export default MaintenanceRequests;
