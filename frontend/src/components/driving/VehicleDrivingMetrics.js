import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { AlertTriangle, Gauge, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const formatMinutes = (minutes) => {
  const m = Math.round(Number(minutes) || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
};

const km = (value) => `${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} km`;

function Stat({ label, value, hint, tone }) {
  const toneClass = tone === 'bad' ? 'text-red-700' : tone === 'warn' ? 'text-amber-700' : 'text-slate-800';
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`font-semibold ${toneClass}`}>{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Distance per day as thin bars; a day with speeding gets a red mark and label under it. */
function DailyBars({ daily, onSelectDay, speedingKmh }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...daily.map((d) => d.distance_km || 0));
  const shown = hover != null ? daily[hover] : null;
  return (
    <div>
      <div className="flex h-24 items-end gap-[2px]" role="list" aria-label="Distance driven per day">
        {daily.map((d, index) => {
          const height = d.distance_km ? Math.max(4, (d.distance_km / max) * 88) : 2;
          const label = `${d.day}: ${km(d.distance_km)}, driving ${formatMinutes(d.moving_minutes)}, top ${d.max_speed_kmh} km/h${
            d.speeding_events ? `, ${d.speeding_events} speeding` : ''
          }`;
          return (
            <button
              key={d.day}
              type="button"
              role="listitem"
              className="group flex h-full flex-1 flex-col items-center justify-end px-[1px] focus:outline-none"
              onMouseEnter={() => setHover(index)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(index)}
              onBlur={() => setHover(null)}
              onClick={() => onSelectDay?.(d.day)}
              aria-label={onSelectDay ? `${label}. Show this day's route` : label}
              disabled={!onSelectDay || !d.distance_km}
            >
              {d.speeding_events > 0 && <span className="mb-0.5 h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden />}
              <span
                className={`w-full max-w-[18px] rounded-t-[4px] transition-colors ${
                  hover === index ? 'bg-amber-600' : d.distance_km ? 'bg-amber-400' : 'bg-slate-200'
                } group-focus-visible:ring-2 group-focus-visible:ring-amber-500`}
                style={{ height }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-slate-500">
        <span>{daily[0]?.day?.slice(5)}</span>
        <span>{daily[daily.length - 1]?.day?.slice(5)}</span>
      </div>
      <p className="mt-1 min-h-[2.5rem] text-xs text-slate-600" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-slate-800">
              {new Date(`${shown.day}T12:00:00Z`).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' })}
            </span>
            {': '}
            {km(shown.distance_km)} · {formatMinutes(shown.moving_minutes)} driving · top {shown.max_speed_kmh} km/h
            {shown.speeding_events > 0 && (
              <span className="text-red-700"> · {shown.speeding_events} time{shown.speeding_events === 1 ? '' : 's'} over {speedingKmh}</span>
            )}
            {onSelectDay && shown.distance_km > 0 && <span className="text-amber-700"> · click to replay</span>}
          </>
        ) : (
          <>
            Distance per day.{' '}
            <span className="inline-flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-600" aria-hidden /> speeding that day
            </span>
            {onSelectDay ? '. Click a day to replay its route.' : '.'}
          </>
        )}
      </p>
    </div>
  );
}

/**
 * GPS (ProTrack) and logbook driving figures for one vehicle.
 * `compact` is the Fleet Map side panel; otherwise the Driving Metrics page.
 */
export default function VehicleDrivingMetrics({ vehicleId, compact = false, onSelectDay }) {
  const [days, setDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!vehicleId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API}/vehicle-locations/${vehicleId}/driving-metrics`, { params: { days } });
      setData(res.data);
    } catch (err) {
      setData(null);
      setError(err.response?.data?.detail || 'Could not load driving metrics. Try again shortly.');
    } finally {
      setLoading(false);
    }
  }, [vehicleId, days]);

  useEffect(() => {
    load();
  }, [load]);

  const gps = data?.gps;
  const t = gps?.totals;
  const lb = data?.logbook;
  const limit = data?.thresholds?.speeding_kmh ?? 100;
  const grid = compact ? 'grid grid-cols-2 gap-2' : 'grid grid-cols-2 md:grid-cols-4 gap-3';

  return (
    <div className="space-y-4" data-testid="vehicle-driving-metrics">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="group" aria-label="Period">
          {[7, 30].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(n)}
              aria-pressed={days === n}
              className={`rounded-md px-3 py-1 text-sm ${days === n ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              {n} days
            </button>
          ))}
        </div>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading} aria-label="Refresh driving metrics">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </Button>
      </div>

      {loading && !data && (
        <p className="text-sm text-slate-500">
          Working out driving figures from GPS history. The first look at a vehicle can take up to 20 seconds.
        </p>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}

      {data && (
        <>
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
              <Gauge size={16} /> GPS driving
            </h3>
            {!data.has_tracker ? (
              <p className="text-sm text-slate-600">
                No GPS tracker is linked to this vehicle, so only logbook figures are available.
              </p>
            ) : !gps ? (
              <p className="text-sm text-slate-600">GPS tracking is not set up on this server.</p>
            ) : (
              <>
                {gps.error && (
                  <p className="flex gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-900">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    ProTrack did not answer every request ({gps.error}). Figures may be incomplete.
                  </p>
                )}
                {gps.missing_days.length > 0 && (
                  <p className="rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
                    {gps.missing_days.length} of {days} days are still being fetched from ProTrack and are not counted
                    yet. They fill in automatically; refresh in a few minutes.
                  </p>
                )}
                <div className={grid}>
                  <Stat label="Distance" value={km(t.distance_km)} hint={`${t.days_driven} of ${days} days driven`} />
                  <Stat label="Time driving" value={formatMinutes(t.moving_minutes)} hint={t.avg_moving_speed_kmh ? `avg ${t.avg_moving_speed_kmh} km/h moving` : null} />
                  <Stat label="Top speed" value={`${t.max_speed_kmh} km/h`} tone={t.max_speed_kmh >= limit ? 'bad' : undefined} />
                  <Stat
                    label={`Speeding (${limit}+ km/h)`}
                    value={`${t.speeding_events} time${t.speeding_events === 1 ? '' : 's'}`}
                    hint={t.speeding_events ? `${formatMinutes(t.speeding_minutes)} in total · ${t.speeding_per_100km} per 100 km` : 'None recorded'}
                    tone={t.speeding_events ? 'bad' : undefined}
                  />
                  <Stat label="60–99 km/h" value={formatMinutes(t.fast_minutes)} />
                  <Stat
                    label="Night driving"
                    value={formatMinutes(t.night_minutes)}
                    hint="22:00 to 05:00"
                    tone={t.night_minutes > 60 ? 'warn' : undefined}
                  />
                  <Stat label="Stops (5 min+)" value={t.stops} hint={t.stopped_minutes ? `${formatMinutes(t.stopped_minutes)} stopped` : null} />
                </div>
                {gps.daily.length > 0 && <DailyBars daily={gps.daily} onSelectDay={onSelectDay} speedingKmh={limit} />}
                <p className="text-xs text-slate-500">
                  Measured from the tracker's positions. Harsh braking and acceleration come from the logbook below.
                </p>
              </>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Logbook</h3>
            {lb.totals.trips === 0 ? (
              <p className="text-sm text-slate-600">No logbook trips for this vehicle in the last {days} days.</p>
            ) : (
              <>
                <div className={grid}>
                  <Stat label="Trips" value={lb.totals.trips} hint={km(lb.totals.distance_km)} />
                  <Stat
                    label="Fuel"
                    value={`${lb.totals.fuel_liters} L`}
                    hint={lb.totals.fuel_efficiency_km_per_l ? `${lb.totals.fuel_efficiency_km_per_l} km/L` : null}
                  />
                  <Stat label="Speed violations" value={lb.totals.speed_violations} tone={lb.totals.speed_violations ? 'bad' : undefined} />
                  <Stat
                    label="Harsh braking / accel."
                    value={`${lb.totals.harsh_braking_events} / ${lb.totals.harsh_acceleration_events}`}
                    tone={lb.totals.harsh_braking_events + lb.totals.harsh_acceleration_events > 5 ? 'warn' : undefined}
                  />
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm" data-testid="driving-metrics-drivers">
                    <thead className="text-left text-xs text-slate-500">
                      <tr>
                        <th className="py-1 pr-2 font-medium">Driver</th>
                        <th className="py-1 pr-2 font-medium">Trips</th>
                        <th className="py-1 pr-2 font-medium">Distance</th>
                        {!compact && <th className="py-1 pr-2 font-medium">Fuel</th>}
                        <th className="py-1 pr-2 font-medium">Violations</th>
                        {!compact && <th className="py-1 pr-2 font-medium">Harsh events</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lb.drivers.map((d) => (
                        <tr key={d.driver_id || 'unknown'}>
                          <td className="py-1.5 pr-2 font-medium text-slate-800">{d.driver_name}</td>
                          <td className="py-1.5 pr-2">{d.trips}</td>
                          <td className="py-1.5 pr-2 whitespace-nowrap">{km(d.distance_km)}</td>
                          {!compact && (
                            <td className="py-1.5 pr-2 whitespace-nowrap">
                              {d.fuel_liters} L{d.fuel_efficiency_km_per_l ? ` · ${d.fuel_efficiency_km_per_l} km/L` : ''}
                            </td>
                          )}
                          <td className={`py-1.5 pr-2 ${d.speed_violations ? 'text-red-700 font-semibold' : ''}`}>{d.speed_violations}</td>
                          {!compact && <td className="py-1.5 pr-2">{d.harsh_braking_events + d.harsh_acceleration_events}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}
