import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Truck, Users, Wrench, DollarSign, TrendingUp, AlertCircle, ClipboardCheck, FileCheck } from 'lucide-react';
import { toast } from 'sonner';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const fetchDashboardStats = async () => {
    try {
      const response = await axios.get(`${API}/dashboard/stats`);
      setStats(response.data);
    } catch (error) {
      toast.error('Failed to load dashboard stats');
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

  return (
    <div className="p-6 lg:p-8" data-testid="dashboard">
      <div className="mb-8">
        <h1 className="text-3xl lg:text-4xl font-bold text-slate-800">Fleet Dashboard</h1>
        <p className="text-slate-600 mt-2">Monitor your fleet across Ghana, Liberia, and São Tomé</p>
      </div>

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
              <p className="text-white/70 text-xs mt-1">All countries</p>
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

      {/* Quick Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="fleet-card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">Multi-Country Operations</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Ghana</span>
              <span className="country-badge ghana">GHS</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Liberia</span>
              <span className="country-badge liberia">LRD/USD</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">São Tomé</span>
              <span className="country-badge sao-tome">STN</span>
            </div>
          </div>
        </div>

        <div className="fleet-card">
          <h3 className="text-lg font-semibold text-slate-800 mb-4">AI-Powered Features</h3>
          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-purple-600 mt-0.5" />
              <span>Predictive maintenance analysis</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-purple-600 mt-0.5" />
              <span>OCR document scanning & validation</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-purple-600 mt-0.5" />
              <span>Fuel anomaly detection</span>
            </div>
            <div className="flex items-start gap-2">
              <AlertCircle size={18} className="text-purple-600 mt-0.5" />
              <span>Resale value forecasting</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
