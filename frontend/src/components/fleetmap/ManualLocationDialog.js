import React, { useState } from 'react';
import axios from 'axios';
import { MapPin } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import CountrySelect, { DEFAULT_COUNTRY_CODE, getCountryLabel, normalizeCountryCode } from '../CountrySelect';
import { completeDialogSubmit } from '../../utils/formUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const createInitialFormData = (userCountry) => ({
  vehicle_id: '',
  latitude: '',
  longitude: '',
  address: '',
  city: '',
  country: normalizeCountryCode(userCountry) || DEFAULT_COUNTRY_CODE,
  speed_kmh: '',
  source: 'MANUAL',
  driver_id: '',
});

// For vehicles without a tracker, or when a tracker is down.
export default function ManualLocationDialog({ vehicles, drivers, onSaved }) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState(createInitialFormData());

  const onVehicleChange = (vehicleId) => {
    const vehicle = vehicles.find((item) => item.id === vehicleId);
    setFormData({
      ...formData,
      vehicle_id: vehicleId,
      country: normalizeCountryCode(vehicle?.country) || formData.country || DEFAULT_COUNTRY_CODE,
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.country) return;
    await completeDialogSubmit({
      submit: () =>
        axios.post(`${API}/vehicle-locations`, {
          ...formData,
          latitude: parseFloat(formData.latitude),
          longitude: parseFloat(formData.longitude),
          speed_kmh: formData.speed_kmh ? parseFloat(formData.speed_kmh) : null,
          country: normalizeCountryCode(formData.country),
          city: formData.city?.trim() || null,
          driver_id: formData.driver_id || null,
        }),
      setDialogOpen: setOpen,
      setFormData,
      initialFormData: createInitialFormData,
      onSuccess: onSaved,
      successMessage: 'Vehicle location updated!',
      errorMessage: 'Failed to update location',
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" data-testid="update-location-btn">
          <MapPin size={18} className="mr-2" />
          Enter location
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enter a vehicle location</DialogTitle>
          <DialogDescription>
            For vehicles without a GPS tracker. A newer GPS position replaces it automatically.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Vehicle</Label>
            <Select value={formData.vehicle_id} onValueChange={onVehicleChange}>
              <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
              <SelectContent>
                {vehicles.map((veh) => (
                  <SelectItem key={veh.id} value={veh.id}>
                    {veh.registration_number} - {getCountryLabel(veh.country) || veh.country}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Country *</Label>
            <CountrySelect value={formData.country} onValueChange={(v) => setFormData({ ...formData, country: v })} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Latitude</Label>
              <Input type="number" step="any" value={formData.latitude} onChange={(e) => setFormData({ ...formData, latitude: e.target.value })} placeholder="5.6037" required />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input type="number" step="any" value={formData.longitude} onChange={(e) => setFormData({ ...formData, longitude: e.target.value })} placeholder="-0.1870" required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Address</Label>
              <Input value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })} placeholder="Street address" />
            </div>
            <div>
              <Label>City (optional)</Label>
              <Input value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })} placeholder="City name" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Speed (km/h)</Label>
              <Input type="number" value={formData.speed_kmh} onChange={(e) => setFormData({ ...formData, speed_kmh: e.target.value })} placeholder="0" />
            </div>
            <div>
              <Label>Driver</Label>
              <Select value={formData.driver_id || 'NONE'} onValueChange={(value) => setFormData({ ...formData, driver_id: value === 'NONE' ? '' : value })}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">None</SelectItem>
                  {drivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.first_name} {d.last_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="mt-6 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit">Save location</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
