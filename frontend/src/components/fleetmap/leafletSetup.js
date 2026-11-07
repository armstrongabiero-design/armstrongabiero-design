// leaflet.markercluster attaches itself to a global L, so it must exist before that plugin loads.
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';

if (typeof window !== 'undefined') {
  window.L = L;
}

export default L;
