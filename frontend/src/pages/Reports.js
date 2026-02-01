import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { TrendingUp, DollarSign, Truck, PieChart, BarChart3, User } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const Reports = () => {
  const { user, token, isDriverOrUser } = useAuth();
  const isPersonalView = isDriverOrUser && isDriverOrUser();
  
  const [tcoData, setTcoData] = useState(null);
  const [expenseBreakdown, setExpenseBreakdown] = useState(null);
  const [utilization, setUtilization] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [driverSummary, setDriverSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [selectedCountry, setSelectedCountry] = useState('');
  const [periodDays, setPeriodDays] = useState('30');

  useEffect(() => {
    if (isPersonalView) {
      fetchPersonalReports();
    } else {
      fetchVehicles();
      fetchReports();
    }
  }, [selectedCountry, periodDays, isPersonalView]);

  useEffect(() => {
    if (selectedVehicle && !isPersonalView) {
      fetchVehicleTCO(selectedVehicle);
    }
  }, [selectedVehicle, periodDays]);

  const fetchPersonalReports = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const driverId = user?.driver_id || user?.id;
      
      const response = await axios.get(`${API}/logbook/summary/${driverId}?period_days=${periodDays}`, { headers });
      setDriverSummary(response.data);
    } catch (error) {
      console.error('Failed to fetch personal reports');
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicles = async () => {
    try {
      const response = await axios.get(`${API}/vehicles`);
      setVehicles(response.data);
    } catch (error) {
      console.error('Failed to fetch vehicles');
    }
  };

  const fetchReports = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedCountry) params.append('country', selectedCountry);
      params.append('period_days', periodDays);
      
      const [expenseRes, utilizationRes, fleetTcoRes] = await Promise.all([
        axios.get(`${API}/reports/expense-breakdown?${params}`),
        axios.get(`${API}/reports/utilization?${params}`),
        axios.get(`${API}/tco/fleet?${params}`),
      ]);
      
      setExpenseBreakdown(expenseRes.data);
      setUtilization(utilizationRes.data);
      setTcoData(fleetTcoRes.data);
    } catch (error) {
      console.error('Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const fetchVehicleTCO = async (vehicleId) => {
    try {
      const response = await axios.get(`${API}/tco/vehicle/${vehicleId}?period_days=${periodDays}`);
      setTcoData(response.data);
    } catch (error) {
      console.error('Failed to fetch vehicle TCO');
    }
  };

  const getExpenseColor = (category) => {
    const colors = {
      FUEL: 'bg-blue-500',
      MAINTENANCE: 'bg-purple-500',
      TIRES: 'bg-amber-500',
      INSURANCE: 'bg-green-500',
      LICENSE_FEES: 'bg-indigo-500',
      TOLLS: 'bg-pink-500',
      OTHER: 'bg-slate-500',
    };
    return colors[category] || 'bg-slate-500';
  };

  return (
    <div className="p-6 lg:p-8" data-testid="reports-page">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">
            {isPersonalView ? 'My Reports' : 'Reports & Analytics'}
          </h1>
          <p className="text-slate-600 mt-1">
            {isPersonalView ? 'Your personal driving statistics and performance' : 'TCO, expense breakdown, and fleet utilization'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={periodDays} onValueChange={setPeriodDays}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Period" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 Days</SelectItem>
              <SelectItem value="30">Last 30 Days</SelectItem>
              <SelectItem value="90">Last 90 Days</SelectItem>
              <SelectItem value="365">Last Year</SelectItem>
            </SelectContent>
          </Select>
          {!isPersonalView && (
            <>
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
              <Select value={selectedVehicle || "FLEET"} onValueChange={(v) => setSelectedVehicle(v === "FLEET" ? "" : v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Fleet Overview" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="FLEET">Fleet Overview</SelectItem>
                  {vehicles.map(v => (
                    <SelectItem key={v.id} value={v.id}>{v.registration_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </div>

      {/* Personal Reports for Drivers/Users */}
      {isPersonalView && driverSummary && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
            <div className="fleet-card text-center">
              <div className="bg-blue-100 p-3 rounded-full w-fit mx-auto mb-3">
                <Truck className="text-blue-600" size={24} />
              </div>
              <p className="text-slate-500 text-sm">Total Trips</p>
              <p className="text-3xl font-bold text-slate-800">{driverSummary.total_entries || 0}</p>
            </div>
            <div className="fleet-card text-center">
              <div className="bg-green-100 p-3 rounded-full w-fit mx-auto mb-3">
                <TrendingUp className="text-green-600" size={24} />
              </div>
              <p className="text-slate-500 text-sm">Total Distance</p>
              <p className="text-3xl font-bold text-slate-800">{(driverSummary.total_distance_km || 0).toLocaleString()} km</p>
            </div>
            <div className="fleet-card text-center">
              <div className="bg-purple-100 p-3 rounded-full w-fit mx-auto mb-3">
                <DollarSign className="text-purple-600" size={24} />
              </div>
              <p className="text-slate-500 text-sm">Fuel Used</p>
              <p className="text-3xl font-bold text-slate-800">{(driverSummary.total_fuel_liters || 0).toFixed(1)} L</p>
            </div>
            <div className="fleet-card text-center">
              <div className="bg-amber-100 p-3 rounded-full w-fit mx-auto mb-3">
                <BarChart3 className="text-amber-600" size={24} />
              </div>
              <p className="text-slate-500 text-sm">Avg Efficiency</p>
              <p className="text-3xl font-bold text-slate-800">{(driverSummary.avg_fuel_efficiency || 0).toFixed(1)} km/L</p>
            </div>
          </div>
          
          <div className="fleet-card">
            <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <User className="text-purple-600" />
              Personal Performance Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 rounded-lg text-center">
                <p className="text-sm text-slate-500">Total Hours</p>
                <p className="text-xl font-bold text-slate-800">{(driverSummary.total_hours || 0).toFixed(1)} hrs</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg text-center">
                <p className="text-sm text-slate-500">Avg Trip Distance</p>
                <p className="text-xl font-bold text-slate-800">
                  {driverSummary.total_entries > 0 
                    ? ((driverSummary.total_distance_km || 0) / driverSummary.total_entries).toFixed(1) 
                    : 0} km
                </p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg text-center">
                <p className="text-sm text-slate-500">Speed Violations</p>
                <p className="text-xl font-bold text-red-600">{driverSummary.total_speed_violations || 0}</p>
              </div>
              <div className="p-4 bg-slate-50 rounded-lg text-center">
                <p className="text-sm text-slate-500">Harsh Events</p>
                <p className="text-xl font-bold text-amber-600">
                  {(driverSummary.total_harsh_braking || 0) + (driverSummary.total_harsh_acceleration || 0)}
                </p>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Fleet Reports for Managers */}
      {!isPersonalView && (
        <>
      <div className="fleet-card mb-6">
        <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
          <TrendingUp className="text-purple-600" />
          Total Cost of Ownership (TCO)
          {selectedVehicle && ` - ${vehicles.find(v => v.id === selectedVehicle)?.registration_number}`}
        </h2>
        
        {tcoData && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-slate-500">Fuel Cost</p>
              <p className="text-2xl font-bold text-blue-600">${tcoData.costs?.fuel?.toLocaleString()}</p>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-slate-500">Maintenance</p>
              <p className="text-2xl font-bold text-purple-600">${tcoData.costs?.maintenance?.toLocaleString()}</p>
            </div>
            <div className="text-center p-4 bg-amber-50 rounded-lg">
              <p className="text-sm text-slate-500">Tires</p>
              <p className="text-2xl font-bold text-amber-600">${tcoData.costs?.tires?.toLocaleString()}</p>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-slate-500">Total Cost</p>
              <p className="text-2xl font-bold text-green-600">${tcoData.costs?.total?.toLocaleString()}</p>
            </div>
          </div>
        )}

        {tcoData && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6 pt-6 border-t">
            <div>
              <p className="text-sm text-slate-500">Cost per KM</p>
              <p className="text-xl font-bold text-slate-800">
                ${selectedVehicle ? tcoData.metrics?.cost_per_km_usd?.toFixed(4) : tcoData.cost_per_km_usd?.toFixed(4)}
              </p>
            </div>
            <div>
              <p className="text-sm text-slate-500">Total Distance</p>
              <p className="text-xl font-bold text-slate-800">
                {(selectedVehicle ? tcoData.utilization?.total_distance_km : tcoData.total_distance_km)?.toLocaleString()} km
              </p>
            </div>
            {selectedVehicle && tcoData.utilization && (
              <div>
                <p className="text-sm text-slate-500">Fuel Efficiency</p>
                <p className="text-xl font-bold text-slate-800">
                  {tcoData.utilization.fuel_efficiency_km_per_liter?.toFixed(1)} km/L
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Expense Breakdown */}
        <div className="fleet-card">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <PieChart className="text-purple-600" />
            Expense Breakdown
          </h2>
          
          {expenseBreakdown && (
            <>
              <div className="space-y-3">
                {Object.entries(expenseBreakdown.breakdown || {}).map(([category, data]) => {
                  const percentage = expenseBreakdown.total_usd > 0 
                    ? (data.total_usd / expenseBreakdown.total_usd * 100).toFixed(1)
                    : 0;
                  
                  return (
                    <div key={category}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium">{category.replace('_', ' ')}</span>
                        <span className="text-slate-600">${data.total_usd.toLocaleString()} ({percentage}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div 
                          className={`${getExpenseColor(category)} h-2 rounded-full transition-all`}
                          style={{ width: `${percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 pt-4 border-t">
                <div className="flex justify-between">
                  <span className="font-semibold">Total</span>
                  <span className="font-bold text-lg">${expenseBreakdown.total_usd.toLocaleString()}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Fleet Utilization */}
        <div className="fleet-card">
          <h2 className="text-xl font-semibold text-slate-800 mb-4 flex items-center gap-2">
            <BarChart3 className="text-purple-600" />
            Fleet Utilization
          </h2>
          
          {utilization && (
            <>
              <div className="text-center p-4 bg-slate-50 rounded-lg mb-4">
                <p className="text-sm text-slate-500">Average Fleet Utilization</p>
                <p className="text-3xl font-bold text-purple-600">{utilization.fleet_avg_utilization}%</p>
              </div>
              
              <div className="space-y-3 max-h-64 overflow-y-auto">
                {utilization.vehicles?.map(vehicle => (
                  <div key={vehicle.vehicle_id} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                    <div>
                      <p className="font-medium">{vehicle.registration_number}</p>
                      <p className="text-xs text-slate-500">
                        {vehicle.trip_count} trips • {vehicle.total_distance_km.toLocaleString()} km
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${vehicle.utilization_rate > 50 ? 'text-green-600' : vehicle.utilization_rate > 25 ? 'text-amber-600' : 'text-red-600'}`}>
                        {vehicle.utilization_rate}%
                      </p>
                      <span className={`text-xs ${vehicle.status === 'ACTIVE' ? 'text-green-600' : 'text-slate-500'}`}>
                        {vehicle.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Vehicle-specific details when selected */}
      {selectedVehicle && tcoData?.utilization && (
        <div className="fleet-card mt-6">
          <h2 className="text-xl font-semibold text-slate-800 mb-4">
            Vehicle Details: {tcoData.registration_number}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Total Trips</p>
              <p className="text-xl font-bold text-slate-800">{tcoData.utilization.total_trips}</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Total Distance</p>
              <p className="text-xl font-bold text-slate-800">{tcoData.utilization.total_distance_km.toLocaleString()} km</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Fuel Consumed</p>
              <p className="text-xl font-bold text-slate-800">{tcoData.utilization.total_fuel_liters.toLocaleString()} L</p>
            </div>
            <div className="p-4 bg-slate-50 rounded-lg">
              <p className="text-sm text-slate-500">Cost per Day</p>
              <p className="text-xl font-bold text-slate-800">${tcoData.metrics.cost_per_day_usd.toFixed(2)}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
