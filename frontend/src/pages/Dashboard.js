import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Truck, Users, Wrench, DollarSign, TrendingUp, AlertCircle, AlertTriangle, CheckCircle, XCircle, Clock, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const { user, isGroupManager } = useAuth();
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-slate-600">Loading dashboard...</div>
      </div>
    );
  }

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

  return (
    <div className="p-6 lg:p-8" data-testid="dashboard">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl lg:text-4xl font-bold text-slate-800">Fleet Dashboard</h1>
          <p className="text-slate-600 mt-2">
            {user ? `Welcome, ${user.full_name}` : 'Monitor your fleet across Ghana, Liberia, and São Tomé'}
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
              <SelectItem value="GHANA">Ghana 🇬🇭</SelectItem>
              <SelectItem value="LIBERIA">Liberia 🇱🇷</SelectItem>
              <SelectItem value="SAO_TOME">São Tomé 🇸🇹</SelectItem>
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
              <p className="text-white/70 text-xs mt-1">Rate: 1 USD = {stats?.ghs_exchange_rate || 15.5} GHS</p>
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
              alerts?.alerts?.slice(0, 10).map((alert, idx) => (
                <div key={idx} className={`p-3 rounded-lg border ${getSeverityBg(alert.severity)}`}>
                  <div className="flex items-start gap-2">
                    {getSeverityIcon(alert.severity)}
                    <div className="flex-1">
                      <p className="font-medium text-sm">{alert.title}</p>
                      <p className="text-xs text-slate-600">{alert.message}</p>
                    </div>
                    {alert.country && (
                      <span className="text-xs bg-white px-2 py-1 rounded">
                        {alert.country === 'GHANA' ? '🇬🇭' : alert.country === 'LIBERIA' ? '🇱🇷' : '🇸🇹'}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Compliance Summary */}
        <div className="fleet-card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <CheckCircle size={20} className="text-green-600" />
            Compliance Status
          </h3>
          {compliance && (
            <>
              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">{compliance.summary.compliant}</p>
                  <p className="text-xs text-slate-500">Compliant</p>
                </div>
                <div className="text-center p-3 bg-amber-50 rounded-lg">
                  <p className="text-2xl font-bold text-amber-600">{compliance.summary.warning}</p>
                  <p className="text-xs text-slate-500">Warning</p>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-lg">
                  <p className="text-2xl font-bold text-red-600">{compliance.summary.non_compliant}</p>
                  <p className="text-xs text-slate-500">Non-Compliant</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <span className="font-medium">Overall Compliance Rate</span>
                <span className={`text-xl font-bold ${compliance.summary.compliance_rate >= 80 ? 'text-green-600' : compliance.summary.compliance_rate >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                  {compliance.summary.compliance_rate}%
                </span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Country Breakdown & Features */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fleet-card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Vehicles by Country</h3>
          <div className="space-y-3">
            {stats?.vehicles_by_country && Object.entries(stats.vehicles_by_country).map(([country, count]) => (
              <div key={country} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">
                    {country === 'GHANA' ? '🇬🇭' : country === 'LIBERIA' ? '🇱🇷' : '🇸🇹'}
                  </span>
                  <span className="font-medium">{country === 'SAO_TOME' ? 'São Tomé' : country.charAt(0) + country.slice(1).toLowerCase()}</span>
                </div>
                <span className="text-xl font-bold text-slate-800">{count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="fleet-card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">AI-Powered Features</h3>
          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-start gap-2 p-2 hover:bg-slate-50 rounded">
              <AlertCircle size={18} className="text-purple-600 mt-0.5" />
              <span>Predictive maintenance analysis</span>
            </div>
            <div className="flex items-start gap-2 p-2 hover:bg-slate-50 rounded">
              <AlertCircle size={18} className="text-purple-600 mt-0.5" />
              <span>OCR document scanning & validation</span>
            </div>
            <div className="flex items-start gap-2 p-2 hover:bg-slate-50 rounded">
              <AlertCircle size={18} className="text-purple-600 mt-0.5" />
              <span>Fuel anomaly & fraud detection</span>
            </div>
            <div className="flex items-start gap-2 p-2 hover:bg-slate-50 rounded">
              <AlertCircle size={18} className="text-purple-600 mt-0.5" />
              <span>Resale value forecasting</span>
            </div>
            <div className="flex items-start gap-2 p-2 hover:bg-slate-50 rounded">
              <AlertCircle size={18} className="text-purple-600 mt-0.5" />
              <span>Driver behavior & safety scoring</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
