import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { MapPin, RefreshCw, Navigation, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Country center coordinates
const COUNTRY_COORDS = {
  GHANA: { lat: 7.9465, lng: -1.0232, zoom: 7 },
  LIBERIA: { lat: 6.4281, lng: -9.4295, zoom: 7 },
  SAO_TOME: { lat: 0.1864, lng: 6.6131, zoom: 10 },
};

const VehicleMap = () => {
  const [locations, setLocations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedCountry, setSelectedCountry] = useState('');

  const [formData, setFormData] = useState({
    vehicle_id: '',
    latitude: '',
    longitude: '',
    address: '',
    city: '',
    country: 'GHANA',
    speed_kmh: '',
    source: 'MANUAL',
    driver_id: '',
  });

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      const [locationsRes, vehiclesRes, driversRes] = await Promise.all([
        axios.get(`${API}/vehicle-locations`),
        axios.get(`${API}/vehicles`),
        axios.get(`${API}/drivers`),
      ]);
      setLocations(locationsRes.data);
      setVehicles(vehiclesRes.data);
      setDrivers(driversRes.data);
    } catch (error) {
      console.error('Failed to load location data', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const vehicle = vehicles.find(v => v.id === formData.vehicle_id);
    
    try {
      await axios.post(`${API}/vehicle-locations`, {
        ...formData,
        latitude: parseFloat(formData.latitude),
        longitude: parseFloat(formData.longitude),
        speed_kmh: formData.speed_kmh ? parseFloat(formData.speed_kmh) : null,
        country: vehicle?.country || formData.country,
      });
      toast.success('Vehicle location updated!');
      setDialogOpen(false);
      fetchData();
    } catch (error) {
      toast.error('Failed to update location');
    }
  };

  const filteredLocations = selectedCountry 
    ? locations.filter(l => l.country === selectedCountry)
    : locations;

  const countByCountry = {
    GHANA: locations.filter(l => l.country === 'GHANA').length,
    LIBERIA: locations.filter(l => l.country === 'LIBERIA').length,
    SAO_TOME: locations.filter(l => l.country === 'SAO_TOME').length,
  };

  return (
    <div className="p-6 lg:p-8" data-testid="vehicle-map-page">
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center mb-6 gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Fleet Map</h1>
          <p className="text-slate-600 mt-1">Real-time vehicle locations across all countries</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={selectedCountry || "ALL"} onValueChange={(v) => setSelectedCountry(v === "ALL" ? "" : v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All Countries" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All Countries</SelectItem>
              <SelectItem value="GHANA">Ghana ({countByCountry.GHANA})</SelectItem>
              <SelectItem value="LIBERIA">Liberia ({countByCountry.LIBERIA})</SelectItem>
              <SelectItem value="SAO_TOME">São Tomé ({countByCountry.SAO_TOME})</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchData}>
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button data-testid="update-location-btn">
                <MapPin size={18} className="mr-2" />
                Update Location
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Update Vehicle Location</DialogTitle>
                <DialogDescription>Manually update a vehicle's location (GPS backup).</DialogDescription>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Vehicle</Label>
                  <Select value={formData.vehicle_id} onValueChange={(value) => setFormData({...formData, vehicle_id: value})}>
                    <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                    <SelectContent>
                      {vehicles.map(v => (
                        <SelectItem key={v.id} value={v.id}>{v.registration_number} - {v.country}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Latitude</Label>
                    <Input type="number" step="any" value={formData.latitude} onChange={(e) => setFormData({...formData, latitude: e.target.value})} placeholder="5.6037" required />
                  </div>
                  <div>
                    <Label>Longitude</Label>
                    <Input type="number" step="any" value={formData.longitude} onChange={(e) => setFormData({...formData, longitude: e.target.value})} placeholder="-0.1870" required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Address</Label>
                    <Input value={formData.address} onChange={(e) => setFormData({...formData, address: e.target.value})} placeholder="Street address" />
                  </div>
                  <div>
                    <Label>City</Label>
                    <Input value={formData.city} onChange={(e) => setFormData({...formData, city: e.target.value})} placeholder="City name" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Speed (km/h)</Label>
                    <Input type="number" value={formData.speed_kmh} onChange={(e) => setFormData({...formData, speed_kmh: e.target.value})} placeholder="0" />
                  </div>
                  <div>
                    <Label>Driver</Label>
                    <Select value={formData.driver_id} onValueChange={(value) => setFormData({...formData, driver_id: value})}>
                      <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                      <SelectContent>
                        {drivers.map(d => (
                          <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-6">
                  <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
                  <Button type="submit">Update Location</Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Country Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {Object.entries(COUNTRY_COORDS).map(([country, coords]) => {
          const countryLocations = locations.filter(l => l.country === country);
          const countryName = country === 'SAO_TOME' ? 'São Tomé' : country.charAt(0) + country.slice(1).toLowerCase();
          
          return (
            <div key={country} className={`fleet-card cursor-pointer hover:shadow-lg transition-shadow ${selectedCountry === country ? 'ring-2 ring-purple-500' : ''}`} onClick={() => setSelectedCountry(selectedCountry === country ? '' : country)}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-lg">{countryName}</h3>
                  <p className="text-slate-500 text-sm">{countryLocations.length} vehicles tracked</p>
                </div>
                <div className="text-4xl">
                  {country === 'GHANA' ? '🇬🇭' : country === 'LIBERIA' ? '🇱🇷' : '🇸🇹'}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Map Placeholder - In production, integrate with Google Maps or Mapbox */}
      <div className="fleet-card mb-6">
        <div className="bg-slate-100 rounded-lg h-96 flex items-center justify-center relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-100 to-green-100 opacity-50"></div>
          <div className="relative z-10 text-center">
            <MapPin size={48} className="text-purple-600 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-800">Fleet Map View</h3>
            <p className="text-slate-600 mt-2">
              {filteredLocations.length} vehicles with location data
            </p>
            <p className="text-sm text-slate-500 mt-1">
              Integrate with Google Maps API for full map functionality
            </p>
          </div>
          
          {/* Mini vehicle indicators */}
          <div className="absolute bottom-4 left-4 right-4 flex gap-2 flex-wrap">
            {filteredLocations.slice(0, 10).map((loc, i) => (
              <div key={i} className="bg-white rounded-full px-2 py-1 text-xs shadow flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${loc.status === 'ACTIVE' ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                {loc.registration_number}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Vehicle Locations Table */}
      <div className="fleet-card">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Vehicle Locations</h3>
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Location</th>
                <th>Coordinates</th>
                <th>Speed</th>
                <th>Last Updated</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredLocations.length === 0 ? (
                <tr>
                  <td colSpan="6" className="text-center py-8 text-slate-500">
                    No location data available. Update vehicle locations manually or connect GPS devices.
                  </td>
                </tr>
              ) : (
                filteredLocations.map(loc => (
                  <tr key={loc.vehicle_id}>
                    <td>
                      <div className="font-semibold">{loc.registration_number}</div>
                      <div className="text-xs text-slate-500">{loc.make} {loc.model}</div>
                    </td>
                    <td>
                      <div>{loc.address || '-'}</div>
                      <div className="text-xs text-slate-500">{loc.city || loc.country}</div>
                    </td>
                    <td className="font-mono text-sm">
                      {loc.latitude?.toFixed(4)}, {loc.longitude?.toFixed(4)}
                    </td>
                    <td>
                      {loc.speed_kmh ? (
                        <span className={`font-semibold ${loc.speed_kmh > 100 ? 'text-red-600' : 'text-slate-800'}`}>
                          {loc.speed_kmh} km/h
                        </span>
                      ) : '-'}
                    </td>
                    <td>
                      <div className="flex items-center gap-1 text-sm text-slate-600">
                        <Clock size={14} />
                        {loc.timestamp ? new Date(loc.timestamp).toLocaleString() : '-'}
                      </div>
                    </td>
                    <td>
                      <span className={`status-badge ${loc.status === 'ACTIVE' ? 'bg-green-100 text-green-800' : 'bg-slate-100 text-slate-800'}`}>
                        {loc.status || 'Unknown'}
                      </span>
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

export default VehicleMap;
