import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Users, Shield, CheckCircle, XCircle, Clock, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { useAuth } from '../contexts/AuthContext';
import CountrySelect, { getCountryFlag, getCountryLabel } from '../components/CountrySelect';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const UserManagement = () => {
  const { user: currentUser, isGroupManager } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isGroupManager && isGroupManager()) {
      fetchUsers();
    }
  }, [isGroupManager]);

  const fetchUsers = async () => {
    try {
      const response = await axios.get(`${API}/auth/users`);
      setUsers(response.data);
    } catch (error) {
      toast.error('Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId) => {
    try {
      await axios.put(`${API}/auth/users/${userId}/approve`);
      toast.success('User approved successfully!');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to approve user');
    }
  };

  const handleToggleActive = async (userId, currentStatus) => {
    try {
      await axios.put(`${API}/auth/users/${userId}`, { is_active: !currentStatus });
      toast.success(currentStatus ? 'User deactivated' : 'User activated');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update user');
    }
  };

  const getRoleBadge = (role) => {
    const badges = {
      GROUP_FLEET_MANAGER: { bg: 'bg-amber-100 text-purple-800', icon: Shield, label: 'Group Manager' },
      COUNTRY_FLEET_MANAGER: { bg: 'bg-blue-100 text-blue-800', icon: Users, label: 'Country Manager' },
      DRIVER: { bg: 'bg-green-100 text-green-800', icon: Users, label: 'Driver' },
    };
    return badges[role] || { bg: 'bg-slate-100 text-slate-800', icon: Users, label: role };
  };

  const pendingUsers = users.filter(u => !u.is_approved);
  const activeUsers = users.filter(u => u.is_approved && u.is_active);
  const inactiveUsers = users.filter(u => u.is_approved && !u.is_active);

  if (!isGroupManager || !isGroupManager()) {
    return (
      <div className="p-6 lg:p-8">
        <div className="text-center py-12">
          <Shield size={48} className="mx-auto text-slate-400 mb-4" />
          <h2 className="text-xl font-semibold text-slate-800">Access Denied</h2>
          <p className="text-slate-600">Only Group Fleet Managers can access user management.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8" data-testid="user-management-page">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">User Management</h1>
        <p className="text-slate-600 mt-1">Approve and manage user access to GTI Fleet Solutions</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Total Users</p>
          <p className="text-2xl font-bold text-slate-800">{users.length}</p>
        </div>
        <div className="fleet-card bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-700">Pending Approval</p>
          <p className="text-2xl font-bold text-amber-600">{pendingUsers.length}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Active Users</p>
          <p className="text-2xl font-bold text-green-600">{activeUsers.length}</p>
        </div>
        <div className="fleet-card">
          <p className="text-sm text-slate-500">Inactive Users</p>
          <p className="text-2xl font-bold text-slate-600">{inactiveUsers.length}</p>
        </div>
      </div>

      {/* Pending Approvals */}
      {pendingUsers.length > 0 && (
        <div className="fleet-card mb-6 border-l-4 border-amber-400">
          <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Clock className="text-amber-500" size={20} />
            Pending Approvals ({pendingUsers.length})
          </h2>
          <div className="space-y-3">
            {pendingUsers.map(user => {
              const roleBadge = getRoleBadge(user.role);
              const RoleIcon = roleBadge.icon;
              return (
                <div key={user.id} className="flex items-center justify-between p-4 bg-amber-50 rounded-lg">
                  <div className="flex items-center gap-4">
                    <div className="bg-amber-200 p-2 rounded-full">
                      <RoleIcon size={20} className="text-amber-700" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-800">{user.full_name}</p>
                      <p className="text-sm text-slate-600">{user.email}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${roleBadge.bg}`}>
                          {roleBadge.label}
                        </span>
                        {user.country && (
                          <span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-800">
                            {getCountryLabel(user.country)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button onClick={() => handleApprove(user.id)} className="bg-green-600 hover:bg-green-700">
                    <UserCheck size={18} className="mr-2" />
                    Approve
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Users Table */}
      <div className="fleet-card">
        <h2 className="text-lg font-semibold text-slate-800 mb-4">All Users</h2>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Country</th>
                <th>Status</th>
                <th>Last Login</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(user => {
                const roleBadge = getRoleBadge(user.role);
                const isCurrentUser = user.id === currentUser?.id;
                return (
                  <tr key={user.id} className={isCurrentUser ? 'bg-amber-50' : ''}>
                    <td className="font-semibold">
                      {user.full_name}
                      {isCurrentUser && <span className="text-xs text-amber-600 ml-2">(You)</span>}
                    </td>
                    <td>{user.email}</td>
                    <td>
                      <span className={`px-2 py-1 rounded text-xs font-medium ${roleBadge.bg}`}>
                        {roleBadge.label}
                      </span>
                    </td>
                    <td>
                      {user.country ? (
                        <span>
                          {getCountryFlag(user.country)}{' '}
                          {getCountryLabel(user.country)}
                        </span>
                      ) : (
                        <span className="text-slate-400">All Countries</span>
                      )}
                    </td>
                    <td>
                      {!user.is_approved ? (
                        <span className="flex items-center gap-1 text-amber-600">
                          <Clock size={14} /> Pending
                        </span>
                      ) : user.is_active ? (
                        <span className="flex items-center gap-1 text-green-600">
                          <CheckCircle size={14} /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-500">
                          <XCircle size={14} /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="text-sm text-slate-500">
                      {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td>
                      {!isCurrentUser && user.is_approved && (
                        <Button
                          size="sm"
                          variant={user.is_active ? "outline" : "default"}
                          onClick={() => handleToggleActive(user.id, user.is_active)}
                        >
                          {user.is_active ? 'Deactivate' : 'Activate'}
                        </Button>
                      )}
                      {!user.is_approved && (
                        <Button size="sm" onClick={() => handleApprove(user.id)}>
                          Approve
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
