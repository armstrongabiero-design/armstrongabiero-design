import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Truck, Users, Wrench, DollarSign, TrendingUp, AlertCircle, AlertTriangle, 
  CheckCircle, XCircle, Clock, Bell, ClipboardCheck, Book, FileCheck, Gauge, Activity } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Button } from '../components/ui/button';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Personal Dashboard for Drivers and Users
const PersonalDashboard = ({ user, token }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchPersonalData = async () => {
      try {
        const response = await axios.get(`${API}/dashboard/personal`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setStats(response.data);
      } catch (error) {
        console.error('Failed to fetch personal dashboard:', error);
        // Set default empty state
        setStats({
          total_trips: 0,
          total_distance_km: 0,
          pending_requests: 0,
          approved_requests: 0,
          today_checklist_completed: false,
          assigned_vehicle: null,
          recent_requests: []
        });
      } finally {
        setLoading(false);
      }
    };
    fetchPersonalData();
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-slate-600">Loading your dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8" data-testid="personal-dashboard">
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold text-slate-800">Welcome, {user?.full_name}</h1>
        <p className="text-slate-600 mt-2">Your personal fleet activity dashboard</p>
      </div>

      {/* Quick Actions */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl p-6 mb-8 text-white">
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link to="/pre-trip-checklist">
            <div className={`bg-white/10 hover:bg-white/20 rounded-lg p-4 text-center transition-all ${
              !stats?.today_checklist_completed ? 'ring-2 ring-yellow-400' : ''
            }`}>
              <ClipboardCheck size={28} className="mx-auto mb-2" />
              <p className="text-sm font-medium">Pre-Trip Check</p>
              {!stats?.today_checklist_completed && (
                <span className="text-xs bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-full">Required</span>
              )}
            </div>
          </Link>
          <Link to="/logbook">
            <div className="bg-white/10 hover:bg-white/20 rounded-lg p-4 text-center transition-all">
              <Book size={28} className="mx-auto mb-2" />
              <p className="text-sm font-medium">My Logbook</p>
            </div>
          </Link>
          <Link to="/maintenance-requests">
            <div className="bg-white/10 hover:bg-white/20 rounded-lg p-4 text-center transition-all">
              <FileCheck size={28} className="mx-auto mb-2" />
              <p className="text-sm font-medium">New Request</p>
            </div>
          </Link>
          <Link to="/driving-metrics">
            <div className="bg-white/10 hover:bg-white/20 rounded-lg p-4 text-center transition-all">
              <Gauge size={28} className="mx-auto mb-2" />
              <p className="text-sm font-medium">My Metrics</p>
            </div>
          </Link>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-blue-100 p-3 rounded-lg">
              <Activity className="text-blue-600" size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm">Total Trips (30 days)</h3>
          <p className="text-3xl font-bold text-slate-800 mt-1">{stats?.total_trips || 0}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-green-100 p-3 rounded-lg">
              <TrendingUp className="text-green-600" size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm">Distance Covered</h3>
          <p className="text-3xl font-bold text-slate-800 mt-1">{(stats?.total_distance_km || 0).toLocaleString()} km</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-orange-100 p-3 rounded-lg">
              <Clock className="text-orange-600" size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm">Pending Requests</h3>
          <p className="text-3xl font-bold text-slate-800 mt-1">{stats?.pending_requests || 0}</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-purple-100 p-3 rounded-lg">
              <Gauge className="text-purple-600" size={24} />
            </div>
          </div>
          <h3 className="text-slate-500 text-sm">Fuel Efficiency</h3>
          <p className="text-3xl font-bold text-slate-800 mt-1">{stats?.avg_fuel_efficiency || 0} km/L</p>
        </div>
      </div>

      {/* Vehicle Info & Recent Requests */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Assigned Vehicle */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Truck size={20} className="text-purple-600" />
            Assigned Vehicle
          </h3>
          {stats?.assigned_vehicle ? (
            <div className="bg-slate-50 rounded-lg p-4">
              <p className="text-xl font-bold text-slate-800">{stats.assigned_vehicle.registration_number}</p>
              <p className="text-slate-600">{stats.assigned_vehicle.make} {stats.assigned_vehicle.model}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                  stats.assigned_vehicle.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                }`}>
                  {stats.assigned_vehicle.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <Truck size={32} className="mx-auto mb-2 opacity-50" />
              <p>No vehicle assigned</p>
            </div>
          )}
        </div>

        {/* Recent Requests */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <FileCheck size={20} className="text-purple-600" />
            Recent Requests
          </h3>
          {stats?.recent_requests?.length > 0 ? (
            <div className="space-y-3">
              {stats.recent_requests.map((request, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div>
                    <p className="text-sm font-medium text-slate-800">{request.request_type || 'Maintenance'}</p>
                    <p className="text-xs text-slate-500">{request.description?.substring(0, 50)}...</p>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    request.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    request.status === 'DENIED' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {request.status}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-500">
              <FileCheck size={32} className="mx-auto mb-2 opacity-50" />
              <p>No requests yet</p>
              <Link to="/maintenance-requests">
                <Button variant="outline" size="sm" className="mt-2">Create Request</Button>
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Today's Checklist Status */}
      <div className={`mt-6 p-4 rounded-lg border ${
        stats?.today_checklist_completed 
          ? 'bg-green-50 border-green-200' 
          : 'bg-yellow-50 border-yellow-200'
      }`}>
        <div className="flex items-center gap-3">
          {stats?.today_checklist_completed ? (
            <>
              <CheckCircle className="text-green-600" size={24} />
              <div>
                <p className="font-semibold text-green-800">Today's Pre-Trip Checklist Complete</p>
                <p className="text-sm text-green-700">Status: {stats.today_checklist_status || 'Completed'}</p>
              </div>
            </>
          ) : (
            <>
              <AlertTriangle className="text-yellow-600" size={24} />
              <div>
                <p className="font-semibold text-yellow-800">Pre-Trip Checklist Required</p>
                <p className="text-sm text-yellow-700">Please complete your daily pre-trip inspection</p>
              </div>
              <Link to="/pre-trip-checklist" className="ml-auto">
                <Button size="sm">Complete Now</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Manager Dashboard (Original)
const ManagerDashboard = ({ user, isGroupManager }) => {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState(user?.country || '');

  useEffect(() => {
    fetchDashboardData();
  }, [selectedCountry]);

  const fetchDashboardData = async () => {
    try {
      const countryParam = selectedCountry ? `?country=${selectedCountry}` : '';
      const [statsRes, alertsRes, complianceRes] = await Promise.all([
        axios.get(`${API}/dashboard/stats${countryParam}`),
        axios.get(`${API}/dashboard/alerts${countryParam}`),
        axios.get(`${API}/dashboard/compliance${countryParam}`),
      ]);
      setStats(statsRes.data);
      setAlerts(alertsRes.data);
      setCompliance(complianceRes.data);
    } catch (error) {
      toast.error('Failed to load dashboard data');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const getSeverityIcon = (severity) => {
    switch (severity) {
      case 'CRITICAL': return <XCircle className="text-red-500" size={18} />;
      case 'WARNING': return <AlertTriangle className="text-amber-500" size={18} />;
      default: return <AlertCircle className="text-blue-500" size={18} />;
    }
  };

  const getSeverityBg = (severity) => {
    switch (severity) {
      case 'CRITICAL': return 'bg-red-50 border-red-200';
      case 'WARNING': return 'bg-amber-50 border-amber-200';
      default: return 'bg-blue-50 border-blue-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-slate-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8" data-testid="manager-dashboard">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-800">Fleet Dashboard</h1>
          <p className="text-slate-600 mt-2">
            {user ? `Welcome, ${user.full_name}` : 'Monitor your fleet operations'}
          </p>
        </div>
        
        {/* Country Filter (Group Manager only) */}
        {isGroupManager && isGroupManager() && (
          <Select value={selectedCountry || "ALL"} onValueChange={(v) => setSelectedCountry(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-48" data-testid="country-filter">
              <SelectValue placeholder="All Countries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Countries (Group View)</SelectItem>
              <SelectItem value="Ghana">Ghana</SelectItem>
              <SelectItem value="Liberia">Liberia</SelectItem>
              <SelectItem value="São Tomé and Príncipe">São Tomé and Príncipe</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Alerts Banner */}
      {alerts && alerts.critical_count > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-start gap-3">
          <Bell className="text-red-600 mt-0.5" size={20} />
          <div>
            <p className="font-semibold text-red-800">{alerts.critical_count} Critical Alert{alerts.critical_count > 1 ? 's' : ''}</p>
            <p className="text-sm text-red-700">Immediate attention required. Check alerts section below.</p>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <div className="stat-card" data-testid="total-vehicles-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Total Vehicles</p>
              <h3 className="text-4xl font-bold mt-2">{stats?.total_vehicles || 0}</h3>
              <p className="text-white/70 text-xs mt-1">{stats?.active_vehicles || 0} active</p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <Truck size={28} />
            </div>
          </div>
        </div>

        <div className="stat-card green" data-testid="total-drivers-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Total Drivers</p>
              <h3 className="text-4xl font-bold mt-2">{stats?.total_drivers || 0}</h3>
              <p className="text-white/70 text-xs mt-1">
                {stats?.drivers_by_country && !selectedCountry 
                  ? `GH: ${stats.drivers_by_country.GHANA || 0} | LR: ${stats.drivers_by_country.LIBERIA || 0} | ST: ${stats.drivers_by_country.SAO_TOME || 0}`
                  : 'All countries'}
              </p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <Users size={28} />
            </div>
          </div>
        </div>

        <div className="stat-card orange" data-testid="pending-maintenance-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Pending Maintenance</p>
              <h3 className="text-4xl font-bold mt-2">{stats?.pending_maintenance || 0}</h3>
              <p className="text-white/70 text-xs mt-1">{stats?.pending_requests || 0} awaiting approval</p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <Wrench size={28} />
            </div>
          </div>
        </div>

        <div className="stat-card blue" data-testid="fleet-value-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Fleet Value</p>
              <h3 className="text-4xl font-bold mt-2">${(stats?.total_fleet_value_usd || 0).toLocaleString()}</h3>
              <p className="text-white/70 text-xs mt-1">USD equivalent</p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <TrendingUp size={28} />
            </div>
          </div>
        </div>

        <div className="stat-card" data-testid="fuel-cost-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Total Fuel Cost</p>
              <h3 className="text-4xl font-bold mt-2">${(stats?.total_fuel_cost_usd || 0).toLocaleString()}</h3>
              <p className="text-white/70 text-xs mt-1">All transactions</p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <DollarSign size={28} />
            </div>
          </div>
        </div>

        <div className="stat-card green" data-testid="maintenance-cost-card">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-white/80 text-sm font-medium">Total Maintenance Cost</p>
              <h3 className="text-4xl font-bold mt-2">GH₵{(stats?.total_maintenance_cost_ghs || 0).toLocaleString()}</h3>
              <p className="text-white/70 text-xs mt-1">Rate: 1 USD = {stats?.ghs_exchange_rate || 12} GHS</p>
            </div>
            <div className="bg-white/20 p-3 rounded-lg">
              <Wrench size={28} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Alerts Panel */}
        <div className="fleet-card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <Bell size={20} className="text-purple-600" />
            Active Alerts ({alerts?.total_count || 0})
          </h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {alerts?.alerts?.length === 0 ? (
              <div className="text-center py-8 text-slate-500">
                <CheckCircle size={32} className="mx-auto mb-2 text-green-500" />
                <p>No active alerts. All systems operational!</p>
              </div>
            ) : (
              alerts?.alerts?.slice(0, 8).map((alert, index) => (
                <div key={index} className={`p-3 rounded-lg border ${getSeverityBg(alert.severity)}`}>
                  <div className="flex items-start gap-2">
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1">
                      <p className="font-medium text-sm text-slate-800">{alert.title}</p>
                      <p className="text-xs text-slate-600">{alert.description}</p>
                      {alert.country && (
                        <span className="text-xs text-slate-500 mt-1 inline-block">{alert.country}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Compliance Summary */}
        <div className="fleet-card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle size={20} className="text-purple-600" />
            Compliance Overview
          </h3>
          <div className="space-y-4">
            {/* Compliance Rate */}
            <div>
              <div className="flex justify-between mb-1">
                <span className="text-sm text-slate-600">Overall Compliance</span>
                <span className="text-sm font-semibold">{compliance?.compliance_rate || 0}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2.5">
                <div 
                  className={`h-2.5 rounded-full ${
                    (compliance?.compliance_rate || 0) >= 80 ? 'bg-green-500' :
                    (compliance?.compliance_rate || 0) >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${compliance?.compliance_rate || 0}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="bg-green-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{compliance?.valid_documents || 0}</p>
                <p className="text-xs text-green-600">Valid Documents</p>
              </div>
              <div className="bg-red-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-red-700">{compliance?.expired_documents || 0}</p>
                <p className="text-xs text-red-600">Expired</p>
              </div>
              <div className="bg-amber-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-amber-700">{compliance?.expiring_soon || 0}</p>
                <p className="text-xs text-amber-600">Expiring Soon</p>
              </div>
              <div className="bg-blue-50 rounded-lg p-3 text-center">
                <p className="text-2xl font-bold text-blue-700">{stats?.pending_requests || 0}</p>
                <p className="text-xs text-blue-600">Pending Approvals</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Dashboard Component - Routes to appropriate view based on role
const Dashboard = () => {
  const { user, token, isDriverOrUser, isGroupManager } = useAuth();

  // Show personal dashboard for Drivers and Users
  if (isDriverOrUser && isDriverOrUser()) {
    return <PersonalDashboard user={user} token={token} />;
  }

  // Show manager dashboard for staff
  return <ManagerDashboard user={user} isGroupManager={isGroupManager} />;
};

export default Dashboard;
