import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Truck, Users, Wrench, DollarSign, TrendingUp, AlertCircle, AlertTriangle, 
  CheckCircle, XCircle, Clock, Bell, ClipboardCheck, Book, FileCheck, Gauge, Activity, Shield, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import CountrySelect from '../components/CountrySelect';
import { buildHighlightUrl } from '../utils/recordHighlight';

import {
  safetyScoreTextClass,
  safetyScoreBarClass,
  safetyScoreLabel,
  safetyScoreBand,
} from '../utils/safetyScore';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const DashboardKpi = ({ to, label, value, sub, icon: Icon, iconTone = 'gold', featured = false, testId }) => (
  <Link
    to={to}
    className={`dashboard-kpi${featured ? ' dashboard-kpi--featured' : ''}`}
    data-testid={testId}
  >
    <div className={`dashboard-kpi__icon dashboard-kpi__icon--${iconTone}`}>
      <Icon size={20} />
    </div>
    <div className="dashboard-kpi__body">
      <p className="dashboard-kpi__label">{label}</p>
      <p className="dashboard-kpi__value">{value}</p>
      {sub ? <p className="dashboard-kpi__sub">{sub}</p> : null}
    </div>
  </Link>
);

const DashboardPanelHead = ({ icon: Icon, title, count }) => (
  <div className="dashboard-panel__head">
    <h3 className="dashboard-panel__title">
      <Icon size={18} style={{ color: '#e3aa27' }} />
      {title}
    </h3>
    {count != null && <span className="dashboard-panel__count">{count}</span>}
  </div>
);

// Personal Dashboard for Drivers and Users
const PersonalDashboard = ({ user, token }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchPersonalData = useCallback(async () => {
    try {
      const response = await axios.get(`${API}/dashboard/personal`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
    } catch {
      setStats({
        total_trips: 0,
        total_distance_km: 0,
        pending_requests: 0,
        approved_requests: 0,
        today_checklist_completed: false,
        assigned_vehicle: null,
        recent_requests: [],
        safety_score: 100,
        speed_violations: 0
      });
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchPersonalData();
  }, [fetchPersonalData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg text-slate-600">Loading your dashboard...</div>
      </div>
    );
  }

  const safetyScore = Math.max(0, 100 - (stats?.speed_violations || 0) * 10);
  const band = safetyScoreBand(safetyScore);
  const borderClass =
    band === 'good' ? 'border-green-200' : band === 'attention' ? 'border-yellow-200' : 'border-red-200';
  const lightClass =
    band === 'good' ? 'bg-green-100' : band === 'attention' ? 'bg-yellow-100' : 'bg-red-100';
  const iconBg =
    band === 'good' ? 'bg-green-500' : band === 'attention' ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="dashboard-page" data-testid="personal-dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-header__title">Welcome, {user?.full_name}</h1>
          <p className="dashboard-header__meta">Your personal fleet activity dashboard</p>
        </div>
        <div className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 shrink-0 ${stats?.today_checklist_completed ? 'bg-green-50 border-green-200 text-green-800' : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
          {stats?.today_checklist_completed ? (
            <>
              <CheckCircle size={16} />
              <span>Pre-trip complete</span>
            </>
          ) : (
            <>
              <AlertTriangle size={16} />
              <span>Pre-trip required</span>
              <Link to="/pre-trip-checklist">
                <Button size="sm" variant="outline" className="h-7 text-xs ml-1">Complete</Button>
              </Link>
            </>
          )}
        </div>
      </header>

      {stats?.unread_reminders > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4 flex items-start gap-3">
          <Bell className="text-amber-600 mt-0.5 shrink-0" size={18} />
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 text-sm">{stats.unread_reminders} unread reminder(s)</p>
            <p className="text-xs text-slate-600">Complete today&apos;s Pre-Trip Checklist and Daily Logbook to stop reminders.</p>
          </div>
        </div>
      )}

      <div className="dashboard-personal-top">
        <div className={`${lightClass} border ${borderClass} rounded-xl p-4 h-full flex flex-col justify-center`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className={`${iconBg} p-3 rounded-full shrink-0`}>
                <Shield className="text-white" size={24} />
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-800">Safety Score</h2>
                <p className="text-slate-600 text-xs truncate">{safetyScoreLabel(safetyScore)} · this month</p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className={`text-3xl font-bold leading-none ${safetyScoreTextClass(safetyScore)}`}>{safetyScore}</p>
              <p className="text-slate-500 text-xs">/ 100</p>
            </div>
          </div>
          <div className="w-full bg-white/60 rounded-full h-1.5 mt-3">
            <div className={`h-1.5 rounded-full ${safetyScoreBarClass(safetyScore)}`} style={{ width: `${safetyScore}%` }} />
          </div>
        </div>

        <div className="rounded-xl p-4 text-white h-full flex flex-col" style={{ background: 'linear-gradient(135deg, #e3aa27 0%, #c4912a 100%)' }}>
          <h2 className="text-sm font-semibold mb-3">Quick Actions</h2>
          <div className="dashboard-quick-grid flex-1">
            <Link to="/pre-trip-checklist" className={`dashboard-quick-link${!stats?.today_checklist_completed ? ' dashboard-quick-link--required' : ''}`}>
              <ClipboardCheck size={22} />
              <span>Pre-Trip Check</span>
            </Link>
            <Link to="/logbook" className="dashboard-quick-link">
              <Book size={22} />
              <span>My Logbook</span>
            </Link>
            <Link to="/maintenance-requests" className="dashboard-quick-link">
              <FileCheck size={22} />
              <span>New Request</span>
            </Link>
            <Link to="/driving-metrics" className="dashboard-quick-link">
              <Gauge size={22} />
              <span>My Metrics</span>
            </Link>
          </div>
        </div>
      </div>

      <div className="dashboard-kpi-grid dashboard-kpi-grid--ops mb-4">
        <DashboardKpi
          to="/logbook"
          label="Total Trips (30d)"
          value={stats?.total_trips || 0}
          icon={Activity}
          iconTone="blue"
        />
        <DashboardKpi
          to="/logbook"
          label="Distance Covered"
          value={`${(stats?.total_distance_km || 0).toLocaleString()} km`}
          icon={TrendingUp}
          iconTone="green"
        />
        <DashboardKpi
          to="/maintenance-requests?status=PENDING"
          label="Pending Requests"
          value={stats?.pending_requests || 0}
          icon={Clock}
          iconTone="orange"
        />
        <DashboardKpi
          to="/driving-metrics"
          label="Fuel Efficiency"
          value={`${stats?.avg_fuel_efficiency || 0} km/L`}
          icon={Gauge}
          iconTone="gold"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="fleet-card dashboard-panel">
          <DashboardPanelHead icon={Truck} title="Assigned Vehicle" />
          <div className="flex-1">
            {stats?.assigned_vehicle ? (
              <div className="bg-slate-50 rounded-lg p-4 h-full">
                <p className="text-lg font-bold text-slate-800">{stats.assigned_vehicle.registration_number}</p>
                <p className="text-sm text-slate-600">{stats.assigned_vehicle.make} {stats.assigned_vehicle.model}</p>
              </div>
            ) : (
              <div className="text-center py-6 text-slate-500 bg-slate-50 rounded-lg h-full flex flex-col items-center justify-center">
                <Truck size={28} className="mb-2 opacity-50" />
                <p className="text-sm">No vehicle assigned</p>
              </div>
            )}
          </div>
        </div>

        <div className="fleet-card dashboard-panel">
          <DashboardPanelHead icon={FileCheck} title="Recent Requests" count={stats?.recent_requests?.length || 0} />
          <div className="dashboard-scroll-panel flex-1 min-h-[10rem] space-y-2">
            {stats?.recent_requests?.length > 0 ? (
              stats.recent_requests.map((request) => (
                <div key={request.id || request.request_type} className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{request.request_type || 'Maintenance'}</p>
                    <p className="text-xs text-slate-500 truncate">{request.description}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                    request.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                    request.status === 'DENIED' ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>{request.status}</span>
                </div>
              ))
            ) : (
              <div className="text-center py-6 text-slate-500">
                <FileCheck size={28} className="mx-auto mb-2 opacity-50" />
                <p className="text-sm">No requests yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Staff Dashboard for Fleet Managers and Fleet Officers
const StaffDashboard = ({ user, token, isGroupManager }) => {
  const [stats, setStats] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [compliance, setCompliance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedCountry, setSelectedCountry] = useState('ALL');
  const [showAllPendingUsers, setShowAllPendingUsers] = useState(false);
  const [showAllPendingRequests, setShowAllPendingRequests] = useState(false);

  const fetchDashboardData = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const countryCode = selectedCountry && selectedCountry !== 'ALL' ? selectedCountry : '';
      const countryParam = countryCode ? `?country=${encodeURIComponent(countryCode)}` : '';
      
      const [staffRes, alertsRes, complianceRes] = await Promise.all([
        axios.get(`${API}/dashboard/staff${countryParam}`, { headers }),
        axios.get(`${API}/dashboard/alerts${countryParam}`),
        axios.get(`${API}/dashboard/compliance${countryParam}`),
      ]);
      
      setStats(staffRes.data);
      setAlerts(alertsRes.data);
      setCompliance(complianceRes.data);
    } catch {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  }, [selectedCountry, token]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  useEffect(() => {
    const id = setInterval(() => {
      fetchDashboardData();
    }, 45000);
    return () => clearInterval(id);
  }, [fetchDashboardData]);

  const alertHref = (alert) => {
    const docType = alert.document_type || '';
    if (alert.type === 'DOCUMENT_RENEWAL') {
      return buildHighlightUrl('/documents', alert.entity_id, {
        type: docType,
        entity_id: alert.link_entity_id,
      });
    }
    if (alert.type === 'DOCUMENT_EXPIRY' || alert.type === 'DOCUMENT_MISSING') {
      if (docType === 'DRIVER_LICENSE' || alert.link_entity_type === 'DRIVER') {
        return buildHighlightUrl('/drivers', alert.link_entity_id, { type: docType || 'DRIVER_LICENSE' });
      }
      return buildHighlightUrl('/documents', alert.entity_id || alert.link_entity_id, {
        type: docType,
        entity_id: alert.link_entity_id,
      });
    }
    if (alert.type?.startsWith('MAINTENANCE')) {
      return buildHighlightUrl('/maintenance', alert.entity_id);
    }
    if (alert.type === 'FUEL_ANOMALY') return buildHighlightUrl('/fuel', alert.entity_id);
    if (alert.type === 'SPEEDING') return buildHighlightUrl('/logbook', alert.entity_id);
    if (alert.type === 'LOW_STOCK') return buildHighlightUrl('/inventory', alert.entity_id);
    if (alert.type?.startsWith('TIRE')) return buildHighlightUrl('/tires', alert.entity_id);
    return null;
  };

  const complianceHref = (item) => {
    if (item.check_type === 'DRIVER_LICENSE' || item.entity_type === 'driver') {
      return buildHighlightUrl('/drivers', item.entity_id);
    }
    return buildHighlightUrl('/documents', item.entity_id, {
      type: item.check_type,
      entity_id: item.entity_id,
    });
  };

  const handleApproveUser = async (userId) => {
    try {
      const { data } = await axios.put(`${API}/auth/users/${userId}/approve`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (data.email_notification_sent) {
        toast.success('User approved and notification email sent.');
      } else {
        toast.warning('User approved, but the notification email could not be sent.');
      }
      fetchDashboardData();
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Failed to approve user');
    }
  };

  const getSeverityIcon = (severity) => {
    if (severity === 'CRITICAL') return <XCircle className="text-red-500" size={18} />;
    if (severity === 'WARNING') return <AlertTriangle className="text-amber-500" size={18} />;
    return <AlertCircle className="text-blue-500" size={18} />;
  };

  const getSeverityBg = (severity) => {
    if (severity === 'CRITICAL') return 'bg-red-50 border-red-200';
    if (severity === 'WARNING') return 'bg-amber-50 border-amber-200';
    return 'bg-blue-50 border-blue-200';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-lg text-slate-600">Loading dashboard...</div>
      </div>
    );
  }

  const getRoleDisplay = (role) => {
    const roles = {
      'GROUP_FLEET_MANAGER': 'Group Manager',
      'FLEET_MANAGER': 'Fleet Manager',
      'FLEET_OFFICER': 'Fleet Officer',
      'DRIVER': 'Driver',
      'USER': 'User'
    };
    return roles[role] || role;
  };

  const displayedPendingUsers = showAllPendingUsers 
    ? stats?.pending_users 
    : stats?.pending_users?.slice(0, 4);
  
  const displayedPendingRequests = showAllPendingRequests 
    ? stats?.pending_requests 
    : stats?.pending_requests?.slice(0, 4);

  return (
    <div className="dashboard-page dashboard-page--fill" data-testid="staff-dashboard">
      <header className="dashboard-header">
        <div>
          <h1 className="dashboard-header__title">Fleet Dashboard</h1>
          <div className="dashboard-header__meta">
            <span>{user ? `Welcome, ${user.full_name}` : 'Monitor your fleet operations'}</span>
            {stats?.user_country && stats?.user_role !== 'GROUP_FLEET_MANAGER' && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs rounded-full font-medium">
                {stats.user_country}
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {alerts && (
            <div className="dashboard-alert-chips">
              {(alerts.critical_count || 0) > 0 && (
                <span className="dashboard-chip dashboard-chip--critical">
                  <XCircle size={12} /> {alerts.critical_count} Critical
                </span>
              )}
              {(alerts.warning_count || 0) > 0 && (
                <span className="dashboard-chip dashboard-chip--warning">
                  <AlertTriangle size={12} /> {alerts.warning_count} Warning
                </span>
              )}
              {(alerts.info_count || 0) > 0 && (
                <span className="dashboard-chip dashboard-chip--info">
                  <AlertCircle size={12} /> {alerts.info_count} Info
                </span>
              )}
            </div>
          )}
          {isGroupManager && isGroupManager() && (
            <CountrySelect
              value={selectedCountry}
              onValueChange={setSelectedCountry}
              includeAllOption
              allLabel="All Countries"
              className="w-full sm:w-56"
              data-testid="country-filter"
            />
          )}
        </div>
      </header>

      {/* Operations KPIs */}
      <section className="dashboard-kpi-grid dashboard-kpi-grid--ops" aria-label="Fleet operations">
        <DashboardKpi
          to="/vehicles"
          label="Total Vehicles"
          value={stats?.total_vehicles || 0}
          sub={`${stats?.active_vehicles || 0} active`}
          icon={Truck}
          iconTone="gold"
          featured
          testId="total-vehicles-card"
        />
        <DashboardKpi
          to="/drivers"
          label="Total Drivers"
          value={stats?.total_drivers || 0}
          sub={
            stats?.vehicles_by_country && Object.keys(stats.vehicles_by_country).length > 0
              ? `GH: ${stats.drivers_by_country?.GH ?? stats.drivers_by_country?.GHANA ?? 0} · LR: ${stats.drivers_by_country?.LR ?? stats.drivers_by_country?.LIBERIA ?? 0}`
              : undefined
          }
          icon={Users}
          iconTone="green"
          testId="total-drivers-card"
        />
        <DashboardKpi
          to="/maintenance?work_status=incomplete"
          label="Pending Maintenance"
          value={stats?.pending_maintenance || 0}
          sub={`${stats?.pending_requests_count || 0} awaiting approval`}
          icon={Wrench}
          iconTone="orange"
          testId="pending-maintenance-card"
        />
        <DashboardKpi
          to={`/vehicles?tab=availability${selectedCountry && selectedCountry !== 'ALL' ? `&country=${encodeURIComponent(selectedCountry)}` : ''}`}
          label="Fleet Availability"
          value={`${stats?.availability_pct ?? 0}%`}
          sub={`Active ${stats?.active_vehicles || 0} · Inactive ${stats?.inactive_vehicles || 0}`}
          icon={Activity}
          iconTone="green"
          testId="availability-card"
        />
      </section>

      {/* Financial KPIs */}
      <section className="dashboard-kpi-grid dashboard-kpi-grid--finance" aria-label="Fleet costs">
        <DashboardKpi
          to="/reports"
          label="Fleet Value"
          value={`$${(stats?.total_fleet_value_usd || 0).toLocaleString()}`}
          sub="Vehicle acquisition / asset values (USD)"
          icon={TrendingUp}
          iconTone="blue"
          testId="fleet-value-card"
        />
        <DashboardKpi
          to="/fuel"
          label="Total Fuel Cost"
          value={`$${(stats?.total_fuel_cost_usd || 0).toLocaleString()}`}
          sub="All transactions"
          icon={DollarSign}
          iconTone="gold"
          testId="fuel-cost-card"
        />
        <DashboardKpi
          to="/maintenance"
          label="Maintenance Cost"
          value={`GH₵${(stats?.total_maintenance_cost_ghs || 0).toLocaleString()}`}
          sub={`1 USD = ${stats?.ghs_exchange_rate || 12} GHS`}
          icon={Wrench}
          iconTone="slate"
          testId="maintenance-cost-card"
        />
      </section>

      {/* Alerts & Compliance bento */}
      <section className="dashboard-bento">
        <div className="fleet-card dashboard-panel dashboard-bento-panel !mb-0">
          <DashboardPanelHead icon={Bell} title="Active Alerts" count={alerts?.total_count || 0} />
          <div className="dashboard-scroll-panel dashboard-bento-scroll space-y-1.5">
            {alerts?.alerts?.length === 0 ? (
              <div className="text-center py-10 text-slate-500">
                <CheckCircle size={28} className="mx-auto mb-2 text-green-500" />
                <p className="text-sm">No active alerts</p>
              </div>
            ) : (
              alerts?.alerts?.slice(0, 12).map((alert) => {
                const href = alertHref(alert);
                const body = (
                  <div className={`dashboard-alert-item ${getSeverityBg(alert.severity)} ${href ? 'cursor-pointer' : ''}`}>
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 mt-0.5">{getSeverityIcon(alert.severity)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm text-slate-800 leading-snug">{alert.title}</p>
                        <p className="text-xs text-slate-600 break-words mt-0.5">{alert.message || alert.description}</p>
                      </div>
                    </div>
                  </div>
                );
                return href ? (
                  <Link key={`${alert.type}-${alert.entity_id}-${alert.title}`} to={href} className="block">
                    {body}
                  </Link>
                ) : (
                  <div key={`${alert.type}-${alert.entity_id}-${alert.title}`}>{body}</div>
                );
              })
            )}
          </div>
        </div>

        <div className="fleet-card dashboard-panel dashboard-bento-panel !mb-0">
          <DashboardPanelHead icon={CheckCircle} title="Compliance Review" count={`${compliance?.summary?.compliance_rate || 0}%`} />
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
            <div className="mb-2 shrink-0">
              <div className="flex justify-between mb-1">
                <span className="text-xs text-slate-600">Overall compliance</span>
                <span className="text-xs font-semibold text-slate-800">{compliance?.summary?.compliance_rate || 0}%</span>
              </div>
              <div className="w-full bg-slate-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full ${
                    (compliance?.summary?.compliance_rate || 0) >= 80 ? 'bg-green-500' :
                    (compliance?.summary?.compliance_rate || 0) >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${compliance?.summary?.compliance_rate || 0}%` }}
                />
              </div>
            </div>

            <div className="dashboard-stat-row">
              <div className="dashboard-stat-pill dashboard-stat-pill--green">
                <p className="dashboard-stat-pill__value">{compliance?.summary?.compliant || 0}</p>
                <p className="dashboard-stat-pill__label">Compliant</p>
              </div>
              <div className="dashboard-stat-pill dashboard-stat-pill--red">
                <p className="dashboard-stat-pill__value">{compliance?.summary?.non_compliant || 0}</p>
                <p className="dashboard-stat-pill__label">Non-Compliant</p>
              </div>
              <div className="dashboard-stat-pill dashboard-stat-pill--amber">
                <p className="dashboard-stat-pill__value">{compliance?.summary?.warning || 0}</p>
                <p className="dashboard-stat-pill__label">Expiring</p>
              </div>
              <div className="dashboard-stat-pill dashboard-stat-pill--gold">
                <p className="dashboard-stat-pill__value">{stats?.pending_users_count || 0}</p>
                <p className="dashboard-stat-pill__label">Pending Users</p>
              </div>
            </div>

            <div className="dashboard-scroll-panel dashboard-bento-scroll space-y-1.5 border-t border-slate-100 pt-2 mt-1">
              {(compliance?.issues || compliance?.items?.filter((i) => i.status !== 'COMPLIANT') || []).slice(0, 15).map((item) => (
                <Link
                  key={`${item.entity_id}-${item.check_type}-${item.status}`}
                  to={complianceHref(item)}
                  className="block p-2 rounded-md bg-slate-50 hover:bg-slate-100 border border-slate-100"
                >
                  <p className="text-sm font-medium text-slate-800 truncate">{item.entity_name}</p>
                  <p className="text-xs text-slate-600 truncate">{item.message}</p>
                </Link>
              ))}
              {(compliance?.issues || []).length === 0 && (compliance?.items || []).every((i) => i.status === 'COMPLIANT') && (
                <p className="text-sm text-slate-500 text-center py-4">No open compliance issues</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Action required */}
      {(stats?.pending_users_count > 0 || stats?.pending_requests_count > 0) && (
        <section className={`dashboard-actions-grid${stats?.pending_users_count > 0 && stats?.pending_requests_count > 0 ? ' dashboard-actions-grid--split' : ''}`}>
          {stats?.pending_users_count > 0 && (
            <div className="fleet-card dashboard-panel !mb-0">
              <div className="dashboard-panel__head">
                <h3 className="dashboard-panel__title">
                  <UserPlus size={18} className="text-amber-600" />
                  Pending Accounts
                </h3>
                <div className="flex items-center gap-2">
                  <span className="dashboard-panel__count">{stats.pending_users_count}</span>
                  {stats.pending_users_count > 4 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAllPendingUsers(!showAllPendingUsers)}>
                      {showAllPendingUsers ? 'Less' : 'All'}
                    </Button>
                  )}
                </div>
              </div>
              <div className="dashboard-scroll-panel flex-1 max-h-64 space-y-1.5">
                {displayedPendingUsers?.map((pendingUser) => (
                  <div key={pendingUser.id} className="dashboard-action-row">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-800 truncate">{pendingUser.full_name}</p>
                      <p className="text-xs text-slate-500 truncate">{pendingUser.email} · {getRoleDisplay(pendingUser.role)}</p>
                    </div>
                    <Button size="sm" className="shrink-0 h-8" onClick={() => handleApproveUser(pendingUser.id)}>
                      Approve
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {stats?.pending_requests_count > 0 && (
            <div className="fleet-card dashboard-panel !mb-0">
              <div className="dashboard-panel__head">
                <h3 className="dashboard-panel__title">
                  <Clock size={18} className="text-amber-600" />
                  Maintenance Requests
                </h3>
                <div className="flex items-center gap-2">
                  <span className="dashboard-panel__count">{stats.pending_requests_count}</span>
                  {stats.pending_requests_count > 4 && (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAllPendingRequests(!showAllPendingRequests)}>
                      {showAllPendingRequests ? 'Less' : 'All'}
                    </Button>
                  )}
                </div>
              </div>
              <div className="dashboard-scroll-panel flex-1 max-h-64 space-y-1.5">
                {displayedPendingRequests?.map((request) => (
                  <div key={request.id} className="dashboard-action-row !bg-slate-50 !border-slate-200">
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-slate-800 truncate">{request.request_type}</p>
                      <p className="text-xs text-slate-500 truncate">{request.description}</p>
                    </div>
                    <Link to="/maintenance-requests" className="shrink-0">
                      <Button size="sm" variant="outline" className="h-8">Review</Button>
                    </Link>
                  </div>
                ))}
              </div>
              <Link to="/maintenance-requests" className="text-amber-700 text-xs mt-2 inline-block hover:underline shrink-0">
                Manage all requests →
              </Link>
            </div>
          )}
        </section>
      )}
    </div>
  );
};

// Main Dashboard Component
const Dashboard = () => {
  const { user, token, isDriverOrUser, isGroupManager } = useAuth();

  if (isDriverOrUser && isDriverOrUser()) {
    return <PersonalDashboard user={user} token={token} />;
  }

  return <StaffDashboard user={user} token={token} isGroupManager={isGroupManager} />;
};

export default Dashboard;
