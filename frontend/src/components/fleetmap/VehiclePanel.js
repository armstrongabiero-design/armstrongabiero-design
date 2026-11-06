import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { ArrowLeft, Pause, Play, Route, X, AlertTriangle, Satellite, Link2 } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Slider } from '../ui/slider';
import { getCountryLabel } from '../CountrySelect';
import {
  STATE_META,
  compassPoint,
  formatDuration,
  hasTracker,
  isOldFix,
  isStale,
  locationState,
  timeAgo,
  toLocalInputValue,
} from './trackingUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const PRESETS = [
  {
    key: 'today',
    label: 'Today',
    range: () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      return [start, new Date()];
    },
  },
  {
    key: 'yesterday',
    label: 'Yesterday',
    range: () => {
      const end = new Date();
      end.setHours(0, 0, 0, 0);
      const start = new Date(end);
      start.setDate(start.getDate() - 1);
      return [start, end];
    },
  },
  { key: '24h', label: 'Last 24 h', range: () => [new Date(Date.now() - 86400000), new Date()] },
];

function Fact({ label, value, hint }) {
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold text-slate-800">{value ?? '-'}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

function ReplayControls({ route, cursor, setCursor }) {
  const [playing, setPlaying] = useState(false);
  const timer = useRef(null);
  const total = route.points.length;

  useEffect(() => {
    if (!playing) return undefined;
    // Covers any route in about 30 seconds.
    const step = Math.max(1, Math.round(total / 300));
    timer.current = setInterval(() => {
      setCursor((c) => {
        const next = (c ?? 0) + step;
        if (next >= total - 1) {
          setPlaying(false);
          return total - 1;
        }
        return next;
      });
    }, 100);
    return () => clearInterval(timer.current);
  }, [playing, total, setCursor]);

  const point = route.points[cursor ?? 0];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          aria-label={playing ? 'Pause replay' : 'Play replay'}
          onClick={() => {
            if (!playing && (cursor ?? 0) >= total - 1) setCursor(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={16} /> : <Play size={16} />}
        </Button>
        <Slider
          value={[cursor ?? 0]}
          min={0}
          max={total - 1}
          step={1}
          onValueChange={([v]) => {
            setPlaying(false);
            setCursor(v);
          }}
          aria-label="Replay position"
        />
      </div>
      {point && (
        <div className="flex justify-between text-xs text-slate-600">
          <span>{new Date(point[2] * 1000).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
          <span className="font-semibold">{Math.round(point[3])} km/h</span>
        </div>
      )}
    </div>
  );
}

export default function VehiclePanel({
  location,
  canManageTrackers,
  onClose,
  onOpenTrackers,
  route,
  setRoute,
  routeCursor,
  setRouteCursor,
  onFocusPoint,
}) {
  const [preset, setPreset] = useState(null);
  const [custom, setCustom] = useState(() => {
    const [s, e] = PRESETS[0].range();
    return { start: toLocalInputValue(s), end: toLocalInputValue(e) };
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setPreset(null);
    setError(null);
  }, [location?.vehicle_id]);

  const state = locationState(location);
  const meta = STATE_META[state];
  const tracker = hasTracker(location);

  const loadRoute = async (start, end, key) => {
    setPreset(key);
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API}/vehicle-locations/${location.vehicle_id}/route`, {
        params: { start: start.toISOString(), end: end.toISOString() },
      });
      if (!res.data.points.length) {
        setRoute(null);
        setError('No GPS points in this period.');
      } else {
        setRoute(res.data);
        setRouteCursor(0);
      }
    } catch (err) {
      setRoute(null);
      setError(err.response?.data?.detail || 'Could not load the route. Try again shortly.');
    } finally {
      setLoading(false);
    }
  };

  const summary = route?.summary;
  const stopCount = summary?.stops?.length ?? 0;
  const position = useMemo(
    () => (Number.isFinite(location.latitude) ? `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}` : null),
    [location.latitude, location.longitude],
  );

  return (
    <div className="flex h-full flex-col" data-testid="vehicle-panel">
      <div className="flex items-start gap-2 border-b border-amber-100 pb-3">
        <Button variant="ghost" size="sm" onClick={onClose} aria-label="Back to vehicle list">
          <ArrowLeft size={18} />
        </Button>
        <div className="min-w-0 flex-1">
          <div className="text-lg font-bold text-slate-800">{location.registration_number}</div>
          <div className="truncate text-sm text-slate-500">
            {[location.make, location.model].filter(Boolean).join(' ')} · {getCountryLabel(location.country) || location.country}
          </div>
        </div>
        <span className={`status-badge ${meta.badge}`}>{meta.label}</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pt-3">
        {location.tracker_state_reason && state === 'OFFLINE' && (
          <div className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              {location.tracker_state_reason}. Last signal {timeAgo(location.signal_at) || 'unknown'}. The position
              shown is the last one received.
            </span>
          </div>
        )}
        {isStale(location) && (
          <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>No update from ProTrack since {timeAgo(location.polled_at)}. Speed and status may be out of date.</span>
          </div>
        )}
        {isOldFix(location) && (
          <div className="flex gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <Satellite size={16} className="mt-0.5 shrink-0" />
            <span>
              The tracker is online but has had no GPS fix since {timeAgo(location.timestamp)}, often because the vehicle
              is under cover.
            </span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Fact
            label="Speed"
            value={location.speed_kmh != null ? `${Math.round(location.speed_kmh)} km/h` : null}
            hint={state === 'MOVING' ? compassPoint(location.heading) && `Heading ${compassPoint(location.heading)}` : null}
          />
          <Fact
            label="Engine"
            value={location.engine_on == null ? (tracker ? 'Not reported' : null) : location.engine_on ? 'On' : 'Off'}
          />
          <Fact label="Position from" value={timeAgo(location.timestamp)} hint={location.source === 'MANUAL' ? 'Entered manually' : null} />
          <Fact label="Last signal" value={tracker ? timeAgo(location.signal_at) : null} />
          <Fact
            label="Driver"
            value={location.driver_name || 'Not recorded today'}
            hint={location.driver_name ? `${location.driver_source}, ${timeAgo(location.driver_seen_at)}` : null}
          />
          <Fact
            label="Tracker odometer"
            value={location.tracker_odometer_km != null ? `${location.tracker_odometer_km.toLocaleString()} km` : null}
          />
          {location.battery_percent != null && <Fact label="Tracker battery" value={`${location.battery_percent}%`} />}
          {location.external_power_volts != null && <Fact label="Vehicle battery" value={`${location.external_power_volts} V`} />}
          {location.fuel_liters != null && <Fact label="Fuel level" value={`${location.fuel_liters} L`} />}
        </div>

        {position && (
          <div className="text-xs text-slate-500">
            {location.address ? `${location.address} · ` : ''}
            <span className="font-mono">{position}</span>
            {' · '}
            <a
              className="text-amber-700 underline"
              href={`https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Google Maps
            </a>
          </div>
        )}

        <div className="rounded-lg border border-amber-100 p-3">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-slate-800">
              <Route size={16} /> Route history
            </h3>
            {route && (
              <Button variant="ghost" size="sm" onClick={() => setRoute(null)} aria-label="Clear route">
                <X size={16} />
              </Button>
            )}
          </div>

          {!tracker ? (
            <div className="space-y-2 text-sm text-slate-600">
              <p>No GPS tracker is linked to this vehicle, so there is no route history.</p>
              {canManageTrackers && (
                <Button size="sm" variant="outline" onClick={onOpenTrackers}>
                  <Link2 size={14} className="mr-1" /> Link a tracker
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {PRESETS.map((p) => (
                  <Button
                    key={p.key}
                    size="sm"
                    variant={preset === p.key ? 'default' : 'outline'}
                    disabled={loading}
                    onClick={() => loadRoute(...p.range(), p.key)}
                  >
                    {p.label}
                  </Button>
                ))}
              </div>
              <details className="text-sm">
                <summary className="cursor-pointer text-slate-600">Choose dates</summary>
                <form
                  className="mt-2 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    loadRoute(new Date(custom.start), new Date(custom.end), 'custom');
                  }}
                >
                  <div>
                    <Label htmlFor="route-start">From</Label>
                    <Input
                      id="route-start"
                      type="datetime-local"
                      value={custom.start}
                      onChange={(e) => setCustom({ ...custom, start: e.target.value })}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="route-end">To</Label>
                    <Input
                      id="route-end"
                      type="datetime-local"
                      value={custom.end}
                      onChange={(e) => setCustom({ ...custom, end: e.target.value })}
                      required
                    />
                  </div>
                  <p className="text-xs text-slate-500">Up to 7 days at a time.</p>
                  <Button size="sm" type="submit" disabled={loading}>
                    Show route
                  </Button>
                </form>
              </details>

              {loading && <p className="text-sm text-slate-500">Loading route from ProTrack...</p>}
              {error && <p className="text-sm text-red-700">{error}</p>}

              {route && summary && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2">
                    <Fact label="Distance" value={`${summary.distance_km.toLocaleString()} km`} />
                    <Fact label="Top speed" value={`${Math.round(summary.max_speed_kmh)} km/h`} />
                    <Fact label="Time moving" value={formatDuration(summary.moving_minutes)} />
                    <Fact label="Stops (5 min+)" value={stopCount} />
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-600">
                    <span className="flex items-center gap-1"><i className="inline-block h-1 w-4 rounded bg-green-600" /> under 60</span>
                    <span className="flex items-center gap-1"><i className="inline-block h-1 w-4 rounded bg-amber-600" /> 60–99</span>
                    <span className="flex items-center gap-1"><i className="inline-block h-1 w-4 rounded bg-red-600" /> 100+ km/h</span>
                  </div>
                  <ReplayControls route={route} cursor={routeCursor} setCursor={setRouteCursor} />
                  {route.truncated && (
                    <p className="text-xs text-amber-800">This period has too many points to show in full. Choose a shorter period.</p>
                  )}
                  {stopCount > 0 && (
                    <div>
                      <div className="mb-1 text-xs font-semibold uppercase text-slate-500">Stops</div>
                      <ul className="divide-y divide-slate-100 text-sm">
                        {summary.stops.map((stop) => (
                          <li key={stop.start_at}>
                            <button
                              type="button"
                              className="flex w-full justify-between py-1.5 text-left hover:text-amber-700"
                              onClick={() => onFocusPoint(stop)}
                            >
                              <span>
                                {new Date(stop.start_at).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                              <span className="text-slate-500">{formatDuration(stop.minutes)}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
