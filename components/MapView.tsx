
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DigTicket } from '../types.ts';
import { getTicketStatus, getStatusColor } from '../utils/dateUtils.ts';
import { apiService } from '../services/apiService.ts';

// Rate limit for Nominatim geocoding API (max 1 request/second per usage policy)
const NOMINATIM_RATE_LIMIT_MS = 1100;

const GEOLOCATION_TIMEOUT_MS = 10000;

// Fix leaflet's default icon path issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface MapViewProps {
  tickets: DigTicket[];
  isDarkMode: boolean;
  onEditTicket?: (ticket: DigTicket) => void;
  onViewTicket?: (url: string) => void;
  onTicketGeocoded?: (ticketId: string, lat: number, lng: number) => void;
  onPinMoved?: (ticketId: string, lat: number, lng: number) => void;
}

interface PinnedTicket {
  ticket: DigTicket;
  lat: number;
  lng: number;
  isEstimated: boolean;
}

const createMarkerIcon = (statusClass: string) => {
  const color = statusClass.includes('rose') ? '#ef4444'
    : statusClass.includes('amber') ? '#f59e0b'
    : '#22c55e';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};border:2px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
};

const createDraggableMarkerIcon = (statusClass: string) => {
  const color = statusClass.includes('rose') ? '#ef4444'
    : statusClass.includes('amber') ? '#f59e0b'
    : '#22c55e';
  return L.divIcon({
    className: '',
    html: `<div style="
      width:20px;height:20px;border-radius:50%;
      background:${color};border:3px solid #7c3aed;
      box-shadow:0 0 0 3px rgba(124,58,237,0.3),0 2px 8px rgba(0,0,0,0.4);
      cursor:grab;
    "></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
};

/** Compute the centroid (average lat/lng) of a bounding-box polygon. */
const computeCentroid = (bbox: Array<{ lat: number; lng: number }>): { lat: number; lng: number } => ({
  lat: bbox.reduce((s, p) => s + p.lat, 0) / bbox.length,
  lng: bbox.reduce((s, p) => s + p.lng, 0) / bbox.length,
});

/**
 * Ray-casting point-in-polygon test.
 * Returns true when `point` lies inside the `polygon`.
 */
const isPointInPolygon = (
  point: { lat: number; lng: number },
  polygon: Array<{ lat: number; lng: number }>,
): boolean => {
  const { lat: px, lng: py } = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;
    if (((yi > py) !== (yj > py)) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

/**
 * Resolve a single geocoded coordinate for a ticket, taking into account the
 * ticket's bounding box when available:
 *  1. If a bounding box exists, its centroid is the safe fallback.
 *  2. Geocoding (Nominatim) is attempted using the full address.
 *  3. If the geocoded point lies within the bounding box it is used directly.
 *  4. If it lies outside (or geocoding fails), the centroid is used instead,
 *     guaranteeing the pin always falls inside the marked dig area.
 */
const geocodeAddress = async (ticket: DigTicket): Promise<{ lat: number; lng: number } | null> => {
  if (!ticket.street && !ticket.city) return null;

  const bbox = ticket.boundingBox && ticket.boundingBox.length >= 3 ? ticket.boundingBox : null;
  const centroid = bbox ? computeCentroid(bbox) : null;

  // Strategy 1: Structured Nominatim search — most accurate, includes county and
  // uses "Street & Cross Street" intersection notation when a cross street is present.
  const streetPart = ticket.crossStreet
    ? `${ticket.street} & ${ticket.crossStreet}`
    : ticket.street;
  const structuredParams = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'us' });
  if (streetPart) structuredParams.set('street', streetPart);
  if (ticket.city) structuredParams.set('city', ticket.city);
  if (ticket.state) structuredParams.set('state', ticket.state);
  if (ticket.county) structuredParams.set('county', ticket.county);
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?${structuredParams.toString()}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data?.length > 0) {
      const geocoded = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      if (bbox) {
        return isPointInPolygon(geocoded, bbox) ? geocoded : centroid!;
      }
      return geocoded;
    }
  } catch {
    // fall through to free-text
  }

  // Strategy 2: Free-text fallback — honor rate limit between the two requests.
  await new Promise(r => setTimeout(r, NOMINATIM_RATE_LIMIT_MS));
  const parts = [ticket.street, ticket.city, ticket.state].filter(Boolean);
  if (parts.length === 0) return centroid;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(parts.join(', '))}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data?.length > 0) {
      const geocoded = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
      if (bbox) {
        return isPointInPolygon(geocoded, bbox) ? geocoded : centroid!;
      }
      return geocoded;
    }
  } catch {
    // Geocoding failed – fall back to centroid
  }
  return centroid;
};

export const MapView: React.FC<MapViewProps> = ({ tickets, isDarkMode, onEditTicket, onViewTicket, onTicketGeocoded, onPinMoved }) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const polygonsRef = useRef<L.Polygon[]>([]);
  const userLocationMarkerRef = useRef<L.Marker | null>(null);
  const [pinnedTickets, setPinnedTickets] = useState<PinnedTicket[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [totalToGeocode, setTotalToGeocode] = useState(0);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  // When true, the next markers-effect run skips fitBounds (e.g. after a pin drag).
  const skipFitBoundsRef = useRef(false);

  // Keep refs to the latest callbacks so the async geocoding loop always calls the
  // current version without needing them in the effect's dependency array (which would
  // restart geocoding on every parent render).
  const onTicketGeocodedRef = useRef(onTicketGeocoded);
  const onPinMovedRef = useRef(onPinMoved);
  useEffect(() => { onTicketGeocodedRef.current = onTicketGeocoded; });
  useEffect(() => { onPinMovedRef.current = onPinMoved; });

  const activeTickets = tickets.filter(t => !t.isArchived);
  // Stable key: only changes when tickets are added/removed, NOT when coords are saved.
  // Using this instead of `tickets` as the effect dependency prevents the geocoding loop
  // from restarting every time a coordinate is written back to the parent's state.
  const ticketIdKey = activeTickets.map(t => t.id).sort().join(',');

  // Initialize map once on mount
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    mapRef.current = L.map(mapDivRef.current, { zoomControl: true }).setView([39.5, -98.35], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapRef.current);

    // Force Leaflet to recalculate container size after CSS layout settles
    setTimeout(() => mapRef.current?.invalidateSize(), 100);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Resolve coordinates: show GPS tickets immediately, geocode the rest progressively
  useEffect(() => {
    let cancelled = false;

    const resolveCoordinates = async () => {
      // Immediately show tickets that already have GPS coordinates stored
      const withCoords = activeTickets.filter(t => t.lat != null && t.lng != null);
      const initialPinned: PinnedTicket[] = withCoords.map(t => ({
        ticket: t, lat: t.lat!, lng: t.lng!, isEstimated: false,
      }));
      setPinnedTickets(initialPinned);

      // Then geocode remaining tickets one by one, adding each to the map as it resolves
      const needGeocode = activeTickets.filter(t => t.lat == null || t.lng == null);
      if (needGeocode.length === 0) return;

      setIsGeocoding(true);
      setTotalToGeocode(needGeocode.length);
      setGeocodedCount(0);

      for (const ticket of needGeocode) {
        if (cancelled) break;
        const coords = await geocodeAddress(ticket);
        if (!cancelled && coords) {
          setPinnedTickets(prev => [
            ...prev,
            { ticket, lat: coords.lat, lng: coords.lng, isEstimated: true },
          ]);
          // Update parent state so the ticket is no longer counted as unresolved
          onTicketGeocodedRef.current?.(ticket.id, coords.lat, coords.lng);
          // Persist coordinates directly — this is the authoritative DB write path
          apiService.updateTicketCoords(ticket.id, coords.lat, coords.lng).catch(err =>
            console.error('Failed to persist geocoded coordinates for ticket', ticket.id, err)
          );
        }
        setGeocodedCount(prev => prev + 1);
        // Rate-limit Nominatim requests per their usage policy
        await new Promise(r => setTimeout(r, NOMINATIM_RATE_LIMIT_MS));
      }

      if (!cancelled) setIsGeocoding(false);
    };

    setPinnedTickets([]);
    resolveCoordinates();
    return () => { cancelled = true; };
  }, [ticketIdKey]);

  // Sync markers to the Leaflet map whenever pinnedTickets changes
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old markers and polygons
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];
    polygonsRef.current.forEach(p => p.remove());
    polygonsRef.current = [];

    if (pinnedTickets.length === 0) return;

    const bounds: [number, number][] = [];

    pinnedTickets.forEach(({ ticket, lat, lng, isEstimated }) => {
      const status = getTicketStatus(ticket);
      const statusColorClass = getStatusColor(status);
      const icon = createMarkerIcon(statusColorClass);
      const marker = L.marker([lat, lng], { icon }).addTo(mapRef.current!);

      const hasDoc = Boolean(ticket.documentUrl);
      const viewBtnId = `map-view-${ticket.id}`;
      const editBtnId = `map-edit-${ticket.id}`;
      const adjustBtnId = `map-adjust-${ticket.id}`;

      // Leaflet popups are rendered as raw HTML strings (not React JSX), so
      // inline styles are required here — Tailwind utility classes are not available
      // in this context as they are not part of the popup's DOM scope.
      const popupHtml = `
        <div style="min-width:180px;font-family:system-ui,sans-serif">
          <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#64748b;margin-bottom:4px">
            Job #${ticket.jobNumber}${isEstimated ? ' <span title="Location estimated via geocoding" aria-label="estimated location" style="color:#f59e0b">~</span>' : ''}
          </div>
          <div style="font-size:13px;font-weight:700;margin-bottom:2px">${ticket.street}</div>
          ${ticket.crossStreet ? `<div style="font-size:11px;color:#64748b">at ${ticket.crossStreet}</div>` : ''}
          <div style="font-size:10px;color:#94a3b8;margin-top:2px">${[ticket.city, ticket.state].filter(Boolean).join(', ')}</div>
          <div style="margin-top:6px;font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:#64748b">
            Ticket #${ticket.ticketNo} · Expires ${new Date(ticket.expires).toLocaleDateString()}
          </div>
          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap">
            ${hasDoc ? `<button id="${viewBtnId}" style="padding:4px 10px;background:#3b82f6;color:white;border:none;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer">View PDF</button>` : ''}
            ${onEditTicket ? `<button id="${editBtnId}" style="padding:4px 10px;background:#475569;color:white;border:none;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer">Edit</button>` : ''}
            ${onPinMoved ? `<button id="${adjustBtnId}" style="padding:4px 10px;background:#7c3aed;color:white;border:none;border-radius:8px;font-size:10px;font-weight:700;cursor:pointer">Adjust Pin</button>` : ''}
          </div>
        </div>
      `;
      marker.bindPopup(popupHtml);

      marker.on('popupopen', () => {
        if (hasDoc && onViewTicket) {
          document.getElementById(viewBtnId)?.addEventListener('click', () => {
            onViewTicket(ticket.documentUrl!);
          });
        }
        if (onEditTicket) {
          document.getElementById(editBtnId)?.addEventListener('click', () => {
            onEditTicket(ticket);
          });
        }
        if (onPinMoved) {
          document.getElementById(adjustBtnId)?.addEventListener('click', () => {
            marker.closePopup();
            marker.dragging?.enable();
            marker.setIcon(createDraggableMarkerIcon(statusColorClass));
          });
        }
      });

      marker.on('dragend', () => {
        const pos = marker.getLatLng();
        marker.dragging?.disable();
        marker.setIcon(icon);
        skipFitBoundsRef.current = true;
        setPinnedTickets(prev =>
          prev.map(p => p.ticket.id === ticket.id ? { ...p, lat: pos.lat, lng: pos.lng, isEstimated: false } : p)
        );
        onPinMovedRef.current?.(ticket.id, pos.lat, pos.lng);
      });

      // Double-click opens the PDF viewer directly
      if (onViewTicket && hasDoc) {
        marker.on('dblclick', () => onViewTicket(ticket.documentUrl!));
      } else if (onEditTicket) {
        marker.on('dblclick', () => onEditTicket(ticket));
      }

      bounds.push([lat, lng]);
      markersRef.current.push(marker);

      // Draw the dig-area bounding polygon when the ticket has 3+ corner coordinates.
      const bbox = ticket.boundingBox;
      if (bbox && bbox.length >= 3) {
        const polygonColor = statusColorClass.includes('rose') ? '#ef4444'
          : statusColorClass.includes('amber') ? '#f59e0b'
          : '#22c55e';
        const latlngs = bbox.map(p => [p.lat, p.lng] as [number, number]);
        const polygon = L.polygon(latlngs, {
          color: polygonColor,
          weight: 2,
          opacity: 0.8,
          fillColor: polygonColor,
          fillOpacity: 0.08,
        }).addTo(mapRef.current!);
        polygonsRef.current.push(polygon);
        bbox.forEach(p => bounds.push([p.lat, p.lng]));
      }
    });

    if (bounds.length > 0 && !skipFitBoundsRef.current) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
    skipFitBoundsRef.current = false;
  }, [pinnedTickets, onEditTicket, onViewTicket, onPinMoved]);

  const handleCenterOnMe = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }
    setIsLocating(true);
    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        if (mapRef.current) {
          if (userLocationMarkerRef.current) {
            userLocationMarkerRef.current.remove();
          }
          const userIcon = L.divIcon({
            className: '',
            html: `<div style="
              width:16px;height:16px;border-radius:50%;
              background:#3b82f6;border:3px solid white;
              box-shadow:0 0 0 4px rgba(59,130,246,0.3),0 2px 8px rgba(0,0,0,0.4);
            "></div>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
          });
          userLocationMarkerRef.current = L.marker([latitude, longitude], { icon: userIcon })
            .addTo(mapRef.current)
            .bindPopup('<div style="font-family:system-ui,sans-serif;font-size:12px;font-weight:700">Your Location</div>');
          mapRef.current.setView([latitude, longitude], 14);
        }
        setIsLocating(false);
      },
      (err) => {
        const messages: Record<number, string> = {
          1: 'Location access denied. Please allow location access in your browser settings.',
          2: 'Unable to determine your location.',
          3: 'Location request timed out.',
        };
        setLocationError(messages[err.code] ?? 'Unable to retrieve your location.');
        setIsLocating(false);
      },
      { timeout: GEOLOCATION_TIMEOUT_MS }
    );
  };

  const withCoords = activeTickets.filter(t => t.lat != null && t.lng != null).length;
  const withoutCoords = activeTickets.length - withCoords;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black uppercase tracking-tight">Ticket Map</h2>
          <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isDarkMode ? 'text-slate-500' : 'text-slate-400'}`}>
            Field Location Overview
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'bg-white/5 border-white/5 text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
            {withCoords} GPS
          </div>
          {withoutCoords > 0 && (
            <div className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest ${isDarkMode ? 'bg-white/5 border-white/5 text-slate-400' : 'bg-white border-slate-200 text-slate-600'}`}>
              <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              {withoutCoords} Geocoded
            </div>
          )}
          {isGeocoding && totalToGeocode > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 bg-brand/10 border border-brand/20 rounded-2xl text-[10px] font-black uppercase tracking-widest text-brand">
              <div className="w-2 h-2 bg-brand rounded-full animate-ping" />
              Geocoding {geocodedCount}/{totalToGeocode}
            </div>
          )}
          <button
            onClick={handleCenterOnMe}
            disabled={isLocating}
            title="Center map on my location"
            className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-[10px] font-black uppercase tracking-widest transition-colors ${
              isLocating
                ? 'opacity-60 cursor-not-allowed'
                : isDarkMode
                  ? 'bg-white/5 border-white/5 text-slate-400 hover:bg-white/10 hover:text-slate-200'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
            }`}
          >
            {isLocating ? (
              <div className="w-3.5 h-3.5 rounded-full border-2 border-current border-t-transparent animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="3" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 5a7 7 0 100 14A7 7 0 0012 5z" />
              </svg>
            )}
            {isLocating ? 'Locating…' : 'My Location'}
          </button>
        </div>
      </div>

      {locationError && (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-2xl border text-[11px] font-bold ${isDarkMode ? 'bg-rose-500/10 border-rose-500/20 text-rose-400' : 'bg-rose-50 border-rose-200 text-rose-600'}`}>
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
          {locationError}
        </div>
      )}

      <div className={`rounded-[2.5rem] overflow-hidden border shadow-2xl ${isDarkMode ? 'border-white/5 shadow-black/40' : 'border-slate-200 shadow-slate-200/50'}`}
           style={{ height: 'calc(100vh - 20rem)' }}>
        <div ref={mapDivRef} style={{ width: '100%', height: '100%' }} />
      </div>

      {activeTickets.length === 0 && (
        <div className={`rounded-[2.5rem] p-20 text-center border ${isDarkMode ? 'bg-[#1e293b] border-white/5' : 'bg-white border-slate-200'}`}>
          <div className="w-16 h-16 bg-slate-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">No active tickets to map</p>
        </div>
      )}

      <p className={`text-[9px] font-bold uppercase tracking-widest text-center ${isDarkMode ? 'text-slate-600' : 'text-slate-400'}`}>
        Tickets with stored GPS coordinates are shown immediately. Others are geocoded via OpenStreetMap Nominatim (1 req/sec) and saved for future sessions. When a ticket includes a bounding box, the pin is constrained to stay inside the dig area. Click a marker to view ticket details.
        {onPinMoved && ' Admins can click "Adjust Pin" in any popup to drag a marker to the correct location.'}
      </p>
    </div>
  );
};

export default MapView;
