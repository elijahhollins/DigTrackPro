
import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { DigTicket } from '../types.ts';
import { getTicketStatus, getStatusColor } from '../utils/dateUtils.ts';

// Rate limit for Nominatim geocoding API (max 1 request/second per usage policy)
const NOMINATIM_RATE_LIMIT_MS = 1100;

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

const geocodeAddress = async (ticket: DigTicket): Promise<{ lat: number; lng: number } | null> => {
  const parts = [ticket.street, ticket.city, ticket.state].filter(Boolean);
  if (parts.length === 0) return null;
  const query = encodeURIComponent(parts.join(', '));
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${query}`,
      { headers: { 'Accept-Language': 'en' } }
    );
    const data = await res.json();
    if (data && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    // Geocoding failed – skip silently
  }
  return null;
};

export const MapView: React.FC<MapViewProps> = ({ tickets, isDarkMode, onEditTicket, onViewTicket, onTicketGeocoded }) => {
  const mapRef = useRef<L.Map | null>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.Marker[]>([]);
  const [pinnedTickets, setPinnedTickets] = useState<PinnedTicket[]>([]);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [totalToGeocode, setTotalToGeocode] = useState(0);

  // Keep a ref to the latest callback so the async geocoding loop always calls the
  // current version without needing it in the effect's dependency array (which would
  // restart geocoding on every parent render).
  const onTicketGeocodedRef = useRef(onTicketGeocoded);
  useEffect(() => { onTicketGeocodedRef.current = onTicketGeocoded; });

  const activeTickets = tickets.filter(t => !t.isArchived);

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
          // Persist the resolved coordinates so this ticket won't be geocoded again
          onTicketGeocodedRef.current?.(ticket.id, coords.lat, coords.lng);
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
  }, [tickets]);

  // Sync markers to the Leaflet map whenever pinnedTickets changes
  useEffect(() => {
    if (!mapRef.current) return;

    // Remove old markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

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
      });

      // Double-click opens the PDF viewer directly
      if (onViewTicket && hasDoc) {
        marker.on('dblclick', () => onViewTicket(ticket.documentUrl!));
      } else if (onEditTicket) {
        marker.on('dblclick', () => onEditTicket(ticket));
      }

      bounds.push([lat, lng]);
      markersRef.current.push(marker);
    });

    if (bounds.length > 0) {
      mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
    }
  }, [pinnedTickets, onEditTicket, onViewTicket]);

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
        </div>
      </div>

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
        Tickets with stored GPS coordinates are shown immediately. Others are geocoded via OpenStreetMap Nominatim (1 req/sec) and saved for future sessions. Click a marker to view ticket details.
      </p>
    </div>
  );
};

export default MapView;
