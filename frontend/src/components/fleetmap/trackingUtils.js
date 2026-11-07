import { formatDistanceToNowStrict } from 'date-fns';

// Background map. By default it is the self-hosted Protomaps file that Nginx serves from /maps/,
// so map requests never leave GTI's servers and the CSP stays 'self'. Setting
// REACT_APP_MAP_TILE_URL switches to a raster tile service instead (for local development,
// https://tile.openstreetmap.org/{z}/{x}/{y}.png). Both are baked in at build time.
export const MAP_PMTILES_URL = process.env.REACT_APP_MAP_PMTILES_URL || '/maps/west-africa.pmtiles';
export const MAP_MAX_DATA_ZOOM = Number(process.env.REACT_APP_MAP_MAX_DATA_ZOOM || 15);
export const TILE_URL = process.env.REACT_APP_MAP_TILE_URL || null;
export const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors' +
  (TILE_URL ? '' : ' &middot; <a href="https://protomaps.com" target="_blank" rel="noopener noreferrer">Protomaps</a>');

export const STATE_ORDER = ['MOVING', 'IDLE', 'PARKED', 'OFFLINE', 'MANUAL'];

export const STATE_META = {
  MOVING: { label: 'Moving', color: '#16a34a', badge: 'bg-green-100 text-green-800' },
  IDLE: { label: 'Idling', color: '#d97706', badge: 'bg-amber-100 text-amber-800' },
  PARKED: { label: 'Parked', color: '#475569', badge: 'bg-slate-100 text-slate-700' },
  OFFLINE: { label: 'Offline', color: '#dc2626', badge: 'bg-red-100 text-red-700' },
  MANUAL: { label: 'Manual', color: '#7c3aed', badge: 'bg-violet-100 text-violet-800' },
};

// A GPS position older than this, from a tracker that is still online, is flagged as old.
const OLD_FIX_MINUTES = 30;

export const locationState = (loc) => {
  if (loc?.source === 'GPS' && loc.tracker_state) return loc.tracker_state;
  return 'MANUAL';
};

export const hasTracker = (loc) => Boolean(loc?.imei);

export const timeAgo = (iso) => {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return formatDistanceToNowStrict(date, { addSuffix: true });
};

export const minutesSince = (iso) => {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return (Date.now() - date.getTime()) / 60000;
};

// Our last successful poll for this vehicle. Older than this, the shown state may be out of date.
const STALE_POLL_MINUTES = 3;

export const isStale = (loc) => loc?.source === 'GPS' && (minutesSince(loc.polled_at) ?? 0) > STALE_POLL_MINUTES;

export const isOldFix = (loc) =>
  loc?.source === 'GPS' && locationState(loc) !== 'OFFLINE' && (minutesSince(loc.timestamp) ?? 0) > OLD_FIX_MINUTES;

export const speedColor = (kmh) => {
  if (kmh >= 100) return '#dc2626';
  if (kmh >= 60) return '#d97706';
  return '#16a34a';
};

export const formatDuration = (minutes) => {
  if (minutes == null) return '-';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m} min`;
  return `${h} h ${m} min`;
};

export const compassPoint = (degrees) => {
  if (degrees == null || Number.isNaN(Number(degrees))) return null;
  const points = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return points[Math.round(Number(degrees) / 45) % 8];
};

export const toLocalInputValue = (date) => {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
