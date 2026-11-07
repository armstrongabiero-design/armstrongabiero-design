import React, { useEffect, useMemo, useRef } from 'react';
import L from './leafletSetup';
import 'leaflet.markercluster';
import { leafletLayer } from 'protomaps-leaflet';
import { MapContainer, TileLayer, Polyline, CircleMarker, Marker, Tooltip, useMap } from 'react-leaflet';
import {
  MAP_MAX_DATA_ZOOM,
  MAP_PMTILES_URL,
  STATE_META,
  TILE_ATTRIBUTION,
  TILE_URL,
  isStale,
  locationState,
  speedColor,
} from './trackingUtils';

// Draws the self-hosted map file. Only the parts in view are fetched, using HTTP range requests.
function SelfHostedBasemap() {
  const map = useMap();
  useEffect(() => {
    const layer = leafletLayer({
      url: MAP_PMTILES_URL,
      flavor: 'light',
      lang: 'en',
      maxDataZoom: MAP_MAX_DATA_ZOOM,
      attribution: TILE_ATTRIBUTION,
    });
    layer.addTo(map);
    return () => {
      map.removeLayer(layer);
    };
  }, [map]);
  return null;
}

const DEFAULT_CENTER = [5.6, -2.5]; // West Africa, between Accra and Monrovia
const DEFAULT_ZOOM = 6;

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const vehicleIcon = (loc, selected) => {
  const state = locationState(loc);
  const color = STATE_META[state]?.color || '#475569';
  const size = selected ? 38 : 30;
  const showArrow = state === 'MOVING' && loc.heading != null;
  const body = showArrow
    ? `<path d="M16 3 L26 27 L16 21 L6 27 Z" fill="${color}" stroke="white" stroke-width="2" stroke-linejoin="round"
         transform="rotate(${Number(loc.heading) || 0} 16 16)"/>`
    : `<circle cx="16" cy="16" r="10" fill="${color}" stroke="white" stroke-width="3"/>`;
  const ring = selected ? '<circle cx="16" cy="16" r="15" fill="none" stroke="#e3aa27" stroke-width="3"/>' : '';
  return L.divIcon({
    className: 'fleet-marker',
    html: `<svg width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">${ring}${body}</svg>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    tooltipAnchor: [0, -size / 2],
  });
};

const clusterIcon = (cluster) => {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 100 ? 42 : 50;
  return L.divIcon({
    className: 'fleet-cluster',
    html: `<div style="width:${size}px;height:${size}px">${count}</div>`,
    iconSize: [size, size],
  });
};

function VehicleMarkers({ locations, selectedId, onSelect }) {
  const map = useMap();
  const groupRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    const group = L.markerClusterGroup({
      iconCreateFunction: clusterIcon,
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      // At street level every vehicle is shown on its own, so a selected one is never hidden.
      disableClusteringAtZoom: 15,
      spiderfyOnMaxZoom: false,
    });
    groupRef.current = group;
    map.addLayer(group);
    return () => {
      map.removeLayer(group);
    };
  }, [map]);

  useEffect(() => {
    const group = groupRef.current;
    if (!group) return;
    group.clearLayers();
    const markers = locations
      .filter((loc) => Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude))
      .map((loc) => {
        const selected = loc.vehicle_id === selectedId;
        const marker = L.marker([loc.latitude, loc.longitude], {
          icon: vehicleIcon(loc, selected),
          opacity: isStale(loc) && !selected ? 0.5 : 1,
          zIndexOffset: selected ? 1000 : 0,
          keyboard: true,
          title: loc.registration_number || '',
        });
        const state = STATE_META[locationState(loc)]?.label || '';
        const speed = locationState(loc) === 'MOVING' && loc.speed_kmh ? ` · ${Math.round(loc.speed_kmh)} km/h` : '';
        marker.bindTooltip(`<strong>${escapeHtml(loc.registration_number)}</strong><br/>${escapeHtml(state)}${speed}`, {
          direction: 'top',
        });
        marker.on('click', () => onSelectRef.current(loc.vehicle_id));
        return marker;
      });
    group.addLayers(markers);
  }, [locations, selectedId]);

  return null;
}

function Viewport({ locations, fitKey, focus, routeBounds }) {
  const map = useMap();
  const lastFit = useRef(null);

  // Fit to the vehicles when the page opens or the filter changes, not on every refresh.
  useEffect(() => {
    if (fitKey === lastFit.current) return;
    const points = locations
      .filter((l) => Number.isFinite(l.latitude) && Number.isFinite(l.longitude))
      .map((l) => [l.latitude, l.longitude]);
    if (!points.length) return;
    lastFit.current = fitKey;
    if (points.length === 1) map.setView(points[0], 14);
    else map.fitBounds(points, { padding: [40, 40], maxZoom: 14 });
  }, [map, locations, fitKey]);

  useEffect(() => {
    if (focus) map.flyTo([focus.latitude, focus.longitude], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [map, focus]);

  useEffect(() => {
    if (routeBounds) map.fitBounds(routeBounds, { padding: [40, 40] });
  }, [map, routeBounds]);

  // The map sits in a resizable layout; tell Leaflet when its box changes.
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}

const endIcon = (label, color) =>
  L.divIcon({
    className: 'fleet-route-end',
    html: `<div style="background:${color}">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });

function RouteLayer({ route, cursor }) {
  const segments = useMemo(() => {
    if (!route?.points?.length) return [];
    const result = [];
    let current = null;
    route.points.forEach((p, i) => {
      const color = speedColor(p[3]);
      const latLng = [p[0], p[1]];
      if (!current || current.color !== color) {
        const previous = i > 0 ? [route.points[i - 1][0], route.points[i - 1][1]] : null;
        current = { color, positions: previous ? [previous, latLng] : [latLng] };
        result.push(current);
      } else {
        current.positions.push(latLng);
      }
    });
    return result;
  }, [route]);

  if (!route?.points?.length) return null;
  const first = route.points[0];
  const last = route.points[route.points.length - 1];
  const at = cursor != null ? route.points[cursor] : null;

  return (
    <>
      {segments.map((s, i) => (
        <Polyline key={i} positions={s.positions} pathOptions={{ color: s.color, weight: 5, opacity: 0.85 }} />
      ))}
      {(route.summary?.stops || []).map((stop) => (
        <CircleMarker
          key={stop.start_at}
          center={[stop.latitude, stop.longitude]}
          radius={7}
          pathOptions={{ color: '#1e293b', fillColor: '#fff', fillOpacity: 1, weight: 3 }}
        >
          <Tooltip direction="top">
            Stopped {stop.minutes} min
            <br />
            {new Date(stop.start_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Tooltip>
        </CircleMarker>
      ))}
      <Marker position={[first[0], first[1]]} icon={endIcon('A', '#16a34a')}>
        <Tooltip direction="top">Start · {new Date(first[2] * 1000).toLocaleString()}</Tooltip>
      </Marker>
      <Marker position={[last[0], last[1]]} icon={endIcon('B', '#1e293b')}>
        <Tooltip direction="top">End · {new Date(last[2] * 1000).toLocaleString()}</Tooltip>
      </Marker>
      {at && (
        <CircleMarker
          center={[at[0], at[1]]}
          radius={9}
          pathOptions={{ color: '#fff', fillColor: '#e3aa27', fillOpacity: 1, weight: 3 }}
        />
      )}
    </>
  );
}

export default function FleetMapView({ locations, selectedId, onSelect, fitKey, focus, route, routeCursor }) {
  const routeBounds = useMemo(() => {
    if (!route?.points?.length) return null;
    return L.latLngBounds(route.points.map((p) => [p[0], p[1]]));
  }, [route]);

  return (
    <MapContainer
      center={DEFAULT_CENTER}
      zoom={DEFAULT_ZOOM}
      className="h-full w-full rounded-lg"
      maxZoom={18}
      attributionControl
    >
      {TILE_URL ? <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} /> : <SelfHostedBasemap />}
      <VehicleMarkers locations={locations} selectedId={selectedId} onSelect={onSelect} />
      <RouteLayer route={route} cursor={routeCursor} />
      <Viewport locations={locations} fitKey={fitKey} focus={focus} routeBounds={routeBounds} />
    </MapContainer>
  );
}
