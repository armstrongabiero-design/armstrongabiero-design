import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useSearchParams } from 'react-router-dom';
import { RefreshCw, Radio, Search, AlertTriangle, CircleOff, Settings2 } from 'lucide-react';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import CountrySelect, { countryMatchesFilter, getCountryLabel, normalizeCountryCode } from '../components/CountrySelect';
import { useAuth } from '../contexts/AuthContext';
import FleetMapView from '../components/fleetmap/FleetMapView';
import VehiclePanel from '../components/fleetmap/VehiclePanel';
import TrackerManager from '../components/fleetmap/TrackerManager';
import ManualLocationDialog from '../components/fleetmap/ManualLocationDialog';
import { STATE_META, STATE_ORDER, isOldFix, isStale, locationState, timeAgo } from '../components/fleetmap/trackingUtils';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const REFRESH_MS = 30000;

function StatusPill({ status, lastLoaded }) {
  const updated = timeAgo(status?.last_success_at);
  if (!status) return null;
  const variants = {
    ok: ['bg-green-100 text-green-800', <Radio key="i" size={14} className="animate-pulse" />, `Live · GPS updated ${updated}`],
    delayed: ['bg-amber-100 text-amber-800', <AlertTriangle key="i" size={14} />, `GPS delayed · last update ${updated}`],
    starting: ['bg-slate-100 text-slate-700', <Radio key="i" size={14} />, 'Connecting to ProTrack...'],
    error: ['bg-red-100 text-red-700', <AlertTriangle key="i" size={14} />, 'GPS connection problem'],
    not_configured: ['bg-slate-100 text-slate-600', <CircleOff key="i" size={14} />, 'GPS tracking not connected'],
  };
  const [className, icon, text] = variants[status.state] || variants.starting;
  return (
    <span className={`inline-flex max-w-full items-center gap-1.5 rounded-xl px-3 py-1 text-xs font-semibold leading-tight ${className}`} title={lastLoaded ? `Page refreshed ${timeAgo(lastLoaded)}` : undefined}>
      {icon}
      {text}
    </span>
  );
}

function VehicleRow({ loc, selected, onSelect }) {
  const state = locationState(loc);
  const meta = STATE_META[state];
  const stale = isStale(loc);
  const detail = stale
    ? `as of ${timeAgo(loc.polled_at)}`
    : state === 'MOVING' && loc.speed_kmh != null
      ? `${Math.round(loc.speed_kmh)} km/h`
      : state === 'OFFLINE'
        ? `signal ${timeAgo(loc.signal_at) || 'unknown'}`
        : timeAgo(loc.timestamp);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(loc.vehicle_id)}
        className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-amber-50 ${selected ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}
      >
        <span className={`h-3 w-3 shrink-0 rounded-full ${stale ? 'opacity-40' : ''}`} style={{ background: meta.color }} aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-slate-800">{loc.registration_number}</span>
          <span className="block truncate text-xs text-slate-500">
            {loc.driver_name || [loc.make, loc.model].filter(Boolean).join(' ')}
          </span>
        </span>
        <span className="text-right text-xs">
          <span className="block font-medium" style={{ color: meta.color }}>{meta.label}</span>
          <span className="block text-slate-500">
            {detail}
            {isOldFix(loc) ? ' · old fix' : ''}
          </span>
        </span>
      </button>
    </li>
  );
}

const VehicleMap = () => {
  const { isManager, user } = useAuth();
  const canManageTrackers = isManager();
  const [locations, setLocations] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastLoaded, setLastLoaded] = useState(null);
  const [, setTick] = useState(0);

  const [selectedCountry, setSelectedCountry] = useState('');
  const [stateFilter, setStateFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [focus, setFocus] = useState(null);
  const [route, setRoute] = useState(null);
  const [routeCursor, setRouteCursor] = useState(null);
  const [trackersOpen, setTrackersOpen] = useState(false);
  const [searchParams] = useSearchParams();
  const linkedVehicleId = searchParams.get('vehicle_id');
  const [linkHandled, setLinkHandled] = useState(false);

  const loadLive = useCallback(async () => {
    try {
      const [locRes, statusRes] = await Promise.all([
        axios.get(`${API}/vehicle-locations`),
        axios.get(`${API}/tracking/status`),
      ]);
      setLocations(locRes.data);
      setStatus(statusRes.data);
      setLastLoaded(new Date().toISOString());
    } catch {
      // Keep showing the last data; the status pill shows when it is old.
    } finally {
      setLoading(false);
    }
  }, []);

  const loadReference = useCallback(async () => {
    try {
      const [vehRes, drvRes] = await Promise.all([axios.get(`${API}/vehicles`), axios.get(`${API}/drivers`)]);
      setVehicles(vehRes.data);
      setDrivers(drvRes.data);
    } catch {
      // Names fall back to make and model.
    }
  }, []);

  useEffect(() => {
    loadLive();
    loadReference();
    const refresh = setInterval(() => {
      if (!document.hidden) loadLive();
    }, REFRESH_MS);
    const clock = setInterval(() => setTick((t) => t + 1), 10000);
    const onVisible = () => {
      if (!document.hidden) loadLive();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(refresh);
      clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [loadLive, loadReference]);

  const countries = useMemo(() => {
    const codes = new Set();
    locations.forEach((l) => {
      const code = normalizeCountryCode(l.country);
      if (code) codes.add(code);
    });
    return Array.from(codes).sort();
  }, [locations]);

  const inCountry = useMemo(
    () => (selectedCountry ? locations.filter((l) => countryMatchesFilter(l.country, selectedCountry)) : locations),
    [locations, selectedCountry],
  );

  const counts = useMemo(() => {
    const c = { ALL: inCountry.length };
    STATE_ORDER.forEach((s) => { c[s] = 0; });
    inCountry.forEach((l) => { c[locationState(l)] += 1; });
    return c;
  }, [inCountry]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inCountry
      .filter((l) => stateFilter === 'ALL' || locationState(l) === stateFilter)
      .filter((l) =>
        !q ||
        [l.registration_number, l.make, l.model, l.driver_name].some((v) => (v || '').toLowerCase().includes(q)),
      )
      .sort((a, b) =>
        STATE_ORDER.indexOf(locationState(a)) - STATE_ORDER.indexOf(locationState(b)) ||
        (a.registration_number || '').localeCompare(b.registration_number || ''),
      );
  }, [inCountry, stateFilter, search]);

  const selected = useMemo(() => locations.find((l) => l.vehicle_id === selectedId) || null, [locations, selectedId]);
  const missingPositions = status?.trackers_without_position || 0;

  const selectVehicle = (id) => {
    setSelectedId(id);
    setRoute(null);
    setRouteCursor(null);
    const loc = locations.find((l) => l.vehicle_id === id);
    if (loc && Number.isFinite(loc.latitude)) setFocus({ latitude: loc.latitude, longitude: loc.longitude, at: Date.now() });
  };

  // Opened from another page with ?vehicle_id=: select that vehicle once the positions load.
  useEffect(() => {
    if (linkHandled || !linkedVehicleId || !locations.length) return;
    setLinkHandled(true);
    if (locations.some((l) => l.vehicle_id === linkedVehicleId)) selectVehicle(linkedVehicleId);
    // selectVehicle only reads current state
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedVehicleId, locations, linkHandled]);

  const closePanel = () => {
    setSelectedId(null);
    setRoute(null);
    setRouteCursor(null);
  };

  if (loading) {
    return <div className="p-8 text-center">Loading fleet map...</div>;
  }

  const showProblem = canManageTrackers && status && ['error', 'not_configured'].includes(status.state);

  return (
    <div className="p-6 lg:p-8" data-testid="vehicle-map-page">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-slate-800">Fleet Map</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-slate-600">
            <StatusPill status={status} lastLoaded={lastLoaded} />
            {status?.trackers_linked > 0 && (
              <span className="text-sm">
                {status.trackers_linked} {status.trackers_linked === 1 ? 'vehicle' : 'vehicles'} with GPS
              </span>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={loadLive} aria-label="Refresh now">
            <RefreshCw size={18} className="mr-2" />
            Refresh
          </Button>
          {canManageTrackers && (
            <Button variant="outline" onClick={() => setTrackersOpen(true)}>
              <Settings2 size={18} className="mr-2" />
              Trackers
            </Button>
          )}
          <ManualLocationDialog vehicles={vehicles} drivers={drivers} onSaved={loadLive} />
        </div>
      </div>

      {showProblem && (
        <div className="mb-4 flex gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            {status.state === 'not_configured' ? (
              <>
                <strong>GPS tracking is not connected.</strong> Positions shown were entered manually. Ask the system
                administrator to add the ProTrack account to the server settings.
              </>
            ) : (
              <>
                <strong>Live positions are not updating: {status.message}.</strong> The map shows the last positions
                received{status.last_success_at ? `, ${timeAgo(status.last_success_at)}` : ''}.{' '}
                {{
                  credentials: 'If the ProTrack password was changed, the server settings need the new one. Retrying in 15 minutes.',
                  unreachable: 'The server cannot reach ProTrack. ProTrack may be down, or the server has lost internet access. Retrying every 30 seconds.',
                  rate_limited: 'ProTrack asked us to slow down. Retrying in 2 minutes.',
                }[status.error_kind] || 'Retrying every 30 seconds.'}
              </>
            )}
          </div>
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <CountrySelect
          value={selectedCountry || 'ALL'}
          onValueChange={(v) => setSelectedCountry(v === 'ALL' ? '' : v)}
          includeAllOption
          allLabel="All countries"
          allowedCodes={countries}
          className="w-48"
        />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by status">
          {['ALL', ...STATE_ORDER].map((s) => {
            if (s !== 'ALL' && !counts[s]) return null;
            const active = stateFilter === s;
            const meta = STATE_META[s];
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                onClick={() => setStateFilter(active && s !== 'ALL' ? 'ALL' : s)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors ${active ? 'border-amber-400 bg-amber-50 font-semibold' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                {meta && <span className="h-2.5 w-2.5 rounded-full" style={{ background: meta.color }} aria-hidden="true" />}
                {meta ? meta.label : 'All'} <span className="text-slate-500">{counts[s]}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="fleet-card h-[60vh] min-h-[420px] p-2 lg:h-[calc(100vh-260px)]">
          <FleetMapView
            locations={visible}
            selectedId={selectedId}
            onSelect={selectVehicle}
            fitKey={`${selectedCountry}|${stateFilter}|${visible.length > 0}`}
            focus={focus}
            route={route}
            routeCursor={routeCursor}
          />
        </div>

        <div className="fleet-card flex h-[60vh] min-h-[420px] flex-col p-4 lg:h-[calc(100vh-260px)]">
          {selected ? (
            <VehiclePanel
              location={selected}
              canManageTrackers={canManageTrackers}
              onClose={closePanel}
              onOpenTrackers={() => setTrackersOpen(true)}
              route={route}
              setRoute={setRoute}
              routeCursor={routeCursor}
              setRouteCursor={setRouteCursor}
              onFocusPoint={(p) => setFocus({ latitude: p.latitude, longitude: p.longitude, at: Date.now() })}
            />
          ) : (
            <>
              <div className="relative mb-3">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="Search plate, vehicle or driver"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                  aria-label="Search vehicles"
                />
              </div>
              {visible.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center text-center text-sm text-slate-500">
                  {locations.length === 0 ? (
                    <>
                      <p>No vehicle positions yet.</p>
                      <p className="mt-1">
                        {canManageTrackers
                          ? 'Link GPS trackers to vehicles, or enter a location by hand.'
                          : 'Positions appear here once GPS trackers are linked.'}
                      </p>
                    </>
                  ) : (
                    <p>No vehicles match these filters.</p>
                  )}
                </div>
              ) : (
                <ul className="-mx-1 flex-1 space-y-1 overflow-y-auto px-1">
                  {visible.map((loc) => (
                    <VehicleRow
                      key={loc.vehicle_id}
                      loc={loc}
                      selected={loc.vehicle_id === selectedId}
                      onSelect={selectVehicle}
                    />
                  ))}
                </ul>
              )}
              {missingPositions > 0 && (
                <p className="mt-2 text-xs text-slate-500">
                  {missingPositions} linked tracker{missingPositions === 1 ? ' has' : 's have'} not reported a position yet.
                </p>
              )}
              {!user?.country && countries.length > 1 && (
                <p className="mt-2 text-xs text-slate-500">
                  Showing {selectedCountry ? getCountryLabel(selectedCountry) : 'all countries'}.
                </p>
              )}
            </>
          )}
        </div>
      </div>

      <TrackerManager
        open={trackersOpen}
        onOpenChange={setTrackersOpen}
        vehicles={vehicles}
        onChanged={loadLive}
      />
    </div>
  );
};

export default VehicleMap;
