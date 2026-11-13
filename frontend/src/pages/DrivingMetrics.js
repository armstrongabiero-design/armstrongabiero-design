import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Gauge, AlertTriangle, TrendingUp, TrendingDown, Activity, Clock, MapPin } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import VehicleDrivingMetrics from '../components/driving/VehicleDrivingMetrics';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

/** Staff view: pick a vehicle (GPS + logbook) or a driver (logbook). */
const StaffDrivingMetrics = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const vehicleId = searchParams.get('vehicle_id') || '';
  const driverId = searchParams.get('driver_id') || '';
  const [tab, setTab] = useState(driverId && !vehicleId ? 'driver' : 'vehicle');
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);

  useEffect(() => {
    axios.get(`${API}/vehicles`).then((r) => setVehicles(r.data || [])).catch(() => setVehicles([]));
    axios.get(`${API}/drivers`).then((r) => setDrivers(r.data || [])).catch(() => setDrivers([]));
  }, []);

  const choose = (key, value) => {
    const next = new URLSearchParams(searchParams);
    next.set(key, value);
    setSearchParams(next, { replace: true });
  };

  const sortedVehicles = [...vehicles].sort((a, b) => (a.registration_number || '').localeCompare(b.registration_number || ''));
  const sortedDrivers = [...drivers].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));

  return (
    <div className="p-6 lg:p-8" data-testid="driving-metrics">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-800">Driving Metrics</h1>
        <p className="text-slate-500 mt-1">GPS driving behaviour from the trackers, with logbook figures for each driver</p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="vehicle">By vehicle</TabsTrigger>
          <TabsTrigger value="driver">By driver</TabsTrigger>
        </TabsList>
        <TabsContent value="vehicle">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
            <Select value={vehicleId} onValueChange={(v) => choose('vehicle_id', v)}>
              <SelectTrigger className="w-full sm:w-80" data-testid="metrics-vehicle-select">
                <SelectValue placeholder="Choose a vehicle" />
              </SelectTrigger>
              <SelectContent>
                {sortedVehicles.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.registration_number} — {v.make} {v.model}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {vehicleId && (
              <Link to={`/fleet-map?vehicle_id=${encodeURIComponent(vehicleId)}`} className="inline-flex items-center gap-1 text-sm text-amber-700 underline">
                <MapPin size={14} /> Show on Fleet Map
              </Link>
            )}
          </div>
          {vehicleId ? (
            <div className="fleet-card">
              <VehicleDrivingMetrics key={vehicleId} vehicleId={vehicleId} />
            </div>
          ) : (
            <p className="text-slate-500">Choose a vehicle to see its driving figures, or open a vehicle on the Fleet Map and use its Driving tab.</p>
          )}
        </TabsContent>
        <TabsContent value="driver">
          <div className="mb-4">
            <Select value={driverId} onValueChange={(v) => choose('driver_id', v)}>
              <SelectTrigger className="w-full sm:w-80" data-testid="metrics-driver-select">
                <SelectValue placeholder="Choose a driver" />
              </SelectTrigger>
              <SelectContent>
                {sortedDrivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {driverId ? (
            <LogbookMetrics driverId={driverId} embedded />
          ) : (
            <p className="text-slate-500">Choose a driver to see their logbook figures.</p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
};

const DrivingMetrics = () => {
  const { user, isStaff } = useAuth();
  if (isStaff()) return <StaffDrivingMetrics />;
  return <LogbookMetrics driverId={user?.id} />;
};

const LogbookMetrics = ({ driverId, embedded = false }) => {
  const { token } = useAuth();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  const fetchMetrics = useCallback(async () => {
    setLoading(true);
    try {
      const endpoint = `${API}/logbook/summary/${driverId}?period_days=${period}`;
      
      const response = await axios.get(endpoint, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMetrics(response.data);
    } catch {
      setMetrics({
        total_trips: 0,
        total_distance_km: 0,
        total_fuel_liters: 0,
        avg_fuel_efficiency: 0,
        speed_violations: 0,
        harsh_braking_events: 0,
        harsh_acceleration_events: 0
      });
    } finally {
      setLoading(false);
    }
  }, [period, driverId, token]);

  useEffect(() => {
    fetchMetrics();
  }, [fetchMetrics]);

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center">
        <div className="text-slate-600">Loading metrics...</div>
      </div>
    );
  }

  const metricCards = [
    {
      title: 'Total Distance',
      value: `${(metrics?.total_distance_km || 0).toLocaleString()} km`,
      icon: Activity,
      bgLight: 'bg-blue-50',
      textColor: 'text-blue-600'
    },
    {
      title: 'Total Trips',
      value: metrics?.total_trips || 0,
      icon: TrendingUp,
      bgLight: 'bg-green-50',
      textColor: 'text-green-600'
    },
    {
      title: 'Fuel Efficiency',
      value: `${(metrics?.avg_fuel_efficiency || 0).toFixed(1)} km/L`,
      icon: Gauge,
      bgLight: 'bg-amber-50',
      textColor: 'text-amber-600'
    },
    {
      title: 'Fuel Used',
      value: `${(metrics?.total_fuel_liters || 0).toFixed(1)} L`,
      icon: TrendingDown,
      bgLight: 'bg-orange-50',
      textColor: 'text-orange-600'
    }
  ];

  const safetyMetrics = [
    {
      title: 'Speed Violations',
      value: metrics?.speed_violations || 0,
      color: metrics?.speed_violations > 0 ? 'text-red-600' : 'text-green-600',
      bgColor: metrics?.speed_violations > 0 ? 'bg-red-50' : 'bg-green-50',
      icon: AlertTriangle
    },
    {
      title: 'Harsh Braking',
      value: metrics?.harsh_braking_events || 0,
      color: metrics?.harsh_braking_events > 5 ? 'text-orange-600' : 'text-green-600',
      bgColor: metrics?.harsh_braking_events > 5 ? 'bg-orange-50' : 'bg-green-50',
      icon: Activity
    },
    {
      title: 'Harsh Acceleration',
      value: metrics?.harsh_acceleration_events || 0,
      color: metrics?.harsh_acceleration_events > 5 ? 'text-orange-600' : 'text-green-600',
      bgColor: metrics?.harsh_acceleration_events > 5 ? 'bg-orange-50' : 'bg-green-50',
      icon: TrendingUp
    }
  ];

  return (
    <div className={embedded ? '' : 'p-8'} data-testid={embedded ? 'driver-logbook-metrics' : 'driving-metrics'}>
      <div className="flex items-center justify-between mb-8">
        <div>
          {!embedded && <h1 className="text-3xl font-bold text-slate-800">Driving Metrics</h1>}
          <p className="text-slate-500 mt-1">{embedded ? 'From this driver\'s logbook trips' : 'From your logbook trips'}</p>
        </div>
        
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-slate-400" />
          <select
            value={period}
            onChange={(e) => setPeriod(Number(e.target.value))}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            data-testid="period-selector"
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Main Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {metricCards.map((metric) => {
          const Icon = metric.icon;
          return (
            <div key={metric.title} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <div className={`${metric.bgLight} p-3 rounded-lg`}>
                  <Icon className={metric.textColor} size={24} />
                </div>
              </div>
              <h3 className="text-slate-500 text-sm font-medium">{metric.title}</h3>
              <p className="text-2xl font-bold text-slate-800 mt-1">{metric.value}</p>
            </div>
          );
        })}
      </div>

      {/* Safety Metrics Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-8">
        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
          <AlertTriangle className="text-orange-500" size={24} />
          Safety Metrics
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {safetyMetrics.map((metric) => {
            const Icon = metric.icon;
            return (
              <div 
                key={metric.title} 
                className={`${metric.bgColor} rounded-xl p-6 border border-slate-100`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <Icon className={metric.color} size={20} />
                  <h3 className="font-medium text-slate-700">{metric.title}</h3>
                </div>
                <p className={`text-3xl font-bold ${metric.color}`}>{metric.value}</p>
                <p className="text-xs text-slate-500 mt-2">Events in selected period</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Driving Score */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4">Overall Driving Score</h2>
        <div className="flex items-center gap-8">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full" viewBox="0 0 36 36">
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke="#e5e7eb"
                strokeWidth="3"
              />
              <path
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                fill="none"
                stroke={metrics?.speed_violations > 5 ? '#ef4444' : metrics?.speed_violations > 0 ? '#f59e0b' : '#22c55e'}
                strokeWidth="3"
                strokeDasharray={`${100 - (metrics?.speed_violations || 0) * 5}, 100`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl font-bold text-slate-800">
                {Math.max(0, 100 - (metrics?.speed_violations || 0) * 5)}
              </span>
            </div>
          </div>
          <div>
            <p className="text-lg font-semibold text-slate-800">
              {metrics?.speed_violations === 0 ? 'Excellent!' : 
               metrics?.speed_violations < 3 ? 'Good' : 
               metrics?.speed_violations < 5 ? 'Needs Improvement' : 'Poor'}
            </p>
            <p className="text-slate-500 text-sm mt-1">
              Based on speed violations and driving behavior
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DrivingMetrics;
