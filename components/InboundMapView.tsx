
import React, { useEffect, useRef, useState, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { User, UserRecord } from '../types.ts';
import { InboundTicket, InboundTicketStatus } from '../services/inboundTypes.ts';
import { inboundTicketService } from '../services/inboundTicketService.ts';
import InboundTicketDetail from './InboundTicketDetail.tsx';

// Respect Nominatim's 1 request/second usage policy
const NOMINATIM_RATE_LIMIT_MS = 1100;

// Fix Leaflet default icon path issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface InboundMapViewProps {
  sessionUser: User;
  users:       UserRecord[];
  isAdmin:     boolean;
  isDarkMode?: boolean;
}

interface PinnedTicket {
  ticket: InboundTicket;
  lat:    number;
  lng:    number;
}

const MS_PER_DAY = 86_400_000;

const urgencyColor = (ticket: InboundTicket): string => {
  if (ticket.status === InboundTicketStatus.COMPLETED) return '#94a3b8'; // slate
  if (!ticket.dueDate) return '#7c3aed'; // brand purple
  const diff = Math.ceil((new Date(ticket.dueDate).getTime() - Date.now()) / MS_PER_DAY);
  if (diff < 0)  return '#ef4444'; // rose — overdue
  if (diff <= 1) return '#f97316'; // orange — due today/tomorrow
  if (diff <= 3) return '#f59e0b'; // amber — due soon
  return '#7c3aed'; // brand
};

const createMarkerIcon = (ticket: InboundTicket) => {
  const color = urgencyColor(ticket);
  return L.divIcon({
    className: '',
    html: `<div style="
      width:14px;height:14px;border-radius:50%;
      background:${color};border:2px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
    "></div>`,
    iconSize:    [14, 14],
    iconAnchor:  [7, 7],
    popupAnchor: [0, -10],
  });
};

const geocodeSiteAddress = async (address: string): Promise<{ lat: number; lng: number } | null> => {
  if (!address) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
      { headers: { 'Accept-Language': 'en' } },
    );
    const data = await res.json();
    if (data?.length > 0) {
      return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    }
  } catch {
    // Geocoding failed — return null
  }
  return null;
};

const InboundMapView: React.FC<InboundMapViewProps> = ({
  sessionUser,
  users,
  isAdmin,
  isDarkMode = false,
}) => {
  const dm = isDarkMode;

  const mapDivRef  = useRef<HTMLDivElement>(null);
  const mapRef     = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const [tickets, setTickets]           = useState<InboundTicket[]>([]);
  const [pinnedTickets, setPinnedTickets] = useState<PinnedTicket[]>([]);
  const [isLoading, setIsLoading]       = useState(true);
  const [loadError, setLoadError]       = useState('');
  const [isGeocoding, setIsGeocoding]   = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [totalToGeocode, setTotalToGeocode] = useState(0);
  const [detailTicket, setDetailTicket] = useState<InboundTicket | null>(null);

  // Keep a stable ref so the popup click handler can open the detail without
  // needing to re-register every time `tickets` changes.
  const detailTicketRef = useRef<((t: InboundTicket) => void) | null>(null);
  detailTicketRef.current = setDetailTicket;

  // ── Load tickets ─────────────────────────────────────────────────────────
  const loadTickets = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const data = await inboundTicketService.getTickets();
      setTickets(data);
    } catch (err) {
      setLoadError((err as Error).message ?? 'Failed to load tickets.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadTickets(); }, [loadTickets]);

  // ── Geocode tickets once after loading ───────────────────────────────────
  useEffect(() => {
    if (tickets.length === 0) return;

    const needsGeocode = tickets.filter(t => t.siteAddress);
    setTotalToGeocode(needsGeocode.length);
    setGeocodedCount(0);
    setIsGeocoding(true);
    setPinnedTickets([]);

    let cancelled = false;

    (async () => {
      const pinned: PinnedTicket[] = [];
      for (const ticket of needsGeocode) {
        if (cancelled) break;
        const coords = await geocodeSiteAddress(ticket.siteAddress);
        if (coords) {
          pinned.push({ ticket, ...coords });
          if (!cancelled) {
            setPinnedTickets(prev => [...prev, { ticket, ...coords }]);
            setGeocodedCount(prev => prev + 1);
          }
        } else {
          setGeocodedCount(prev => prev + 1);
        }
        // Respect Nominatim rate limit
        await new Promise(r => setTimeout(r, NOMINATIM_RATE_LIMIT_MS));
      }
      if (!cancelled) setIsGeocoding(false);
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickets.map(t => t.id).sort().join(',')]);

  // ── Initialize Leaflet map once ──────────────────────────────────────────
  useEffect(() => {
    if (!mapDivRef.current || mapRef.current) return;

    mapRef.current = L.map(mapDivRef.current, { zoomControl: true }).setView([39.5, -98.35], 4);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(mapRef.current);
    setTimeout(() => mapRef.current?.invalidateSize(), 100);

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Render markers whenever pinnedTickets changes ────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove existing markers
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    if (pinnedTickets.length === 0) return;

    const bounds: [number, number][] = [];

    pinnedTickets.forEach(({ ticket, lat, lng }) => {
      const color = urgencyColor(ticket);
      const dueLabel = ticket.dueDate
        ? new Date(ticket.dueDate).toLocaleDateString('default', { month: 'short', day: 'numeric', year: 'numeric' })
        : '—';
      const utilities = ticket.utilityTypes?.join(', ') || '—';

      const popupHtml = `
        <div style="min-width:200px;font-family:sans-serif;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;color:${color};margin-bottom:4px;">
            #${ticket.ticketNumber}
          </div>
          <div style="font-size:12px;font-weight:700;color:#1e293b;margin-bottom:2px;">
            ${ticket.siteAddress}
          </div>
          ${ticket.callerName ? `<div style="font-size:11px;color:#64748b;margin-bottom:4px;">${ticket.callerName}</div>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px;">
            <span style="font-size:9px;font-weight:900;text-transform:uppercase;padding:2px 6px;border-radius:4px;background:${color}22;color:${color};">
              ${ticket.status.replace(/_/g, ' ')}
            </span>
            <span style="font-size:9px;font-weight:700;color:#64748b;">Due: ${dueLabel}</span>
          </div>
          ${utilities !== '—' ? `<div style="font-size:9px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.06em;">${utilities}</div>` : ''}
          <button
            onclick="window._inboundMapOpenDetail && window._inboundMapOpenDetail('${ticket.id}')"
            style="margin-top:8px;width:100%;padding:4px 0;background:#7c3aed;color:white;border:none;border-radius:6px;font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:0.08em;cursor:pointer;"
          >
            Open Detail
          </button>
        </div>`;

      const marker = L.marker([lat, lng], { icon: createMarkerIcon(ticket) })
        .bindPopup(popupHtml)
        .addTo(map);

      markersRef.current.push(marker);
      bounds.push([lat, lng]);
    });

    // Fit map to show all markers
    if (bounds.length > 0) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
    }
  }, [pinnedTickets]);

  // ── Wire global popup callback ───────────────────────────────────────────
  useEffect(() => {
    (window as any)._inboundMapOpenDetail = (id: string) => {
      const ticket = tickets.find(t => t.id === id);
      if (ticket && detailTicketRef.current) detailTicketRef.current(ticket);
    };
    return () => { delete (window as any)._inboundMapOpenDetail; };
  }, [tickets]);

  const subtitle = dm ? 'text-slate-500' : 'text-slate-400';

  return (
    <div className="flex flex-col gap-4">
      {/* Progress banner while geocoding */}
      {isGeocoding && (
        <div className={`rounded-xl border px-5 py-3 flex items-center gap-3 ${dm ? 'bg-brand/5 border-brand/10' : 'bg-brand/5 border-brand/10'}`}>
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
          <p className={`text-[11px] font-black uppercase tracking-widest ${dm ? 'text-brand' : 'text-brand'}`}>
            Geocoding addresses… {geocodedCount} / {totalToGeocode}
          </p>
        </div>
      )}

      {/* Map container */}
      <div className={`relative rounded-2xl overflow-hidden border ${dm ? 'border-white/[0.06]' : 'border-slate-100'}`} style={{ height: '540px' }}>
        {isLoading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 dark:bg-[#0b1629]/80">
            <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {loadError && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3">
            <p className={`text-sm font-bold ${dm ? 'text-rose-400' : 'text-rose-600'}`}>{loadError}</p>
            <button onClick={loadTickets} className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl ${dm ? 'bg-white/5 text-slate-300 hover:bg-white/10' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              Retry
            </button>
          </div>
        )}
        <div ref={mapDivRef} className="w-full h-full" />
      </div>

      {/* Legend */}
      <div className={`rounded-xl border px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-100 shadow-sm'}`}>
        <span className={`text-[9px] font-black uppercase tracking-widest ${subtitle}`}>Pin Colors</span>
        {[
          { color: '#ef4444', label: 'Overdue' },
          { color: '#f97316', label: 'Due Today/Tomorrow' },
          { color: '#f59e0b', label: 'Due in ≤3 Days' },
          { color: '#7c3aed', label: 'Active' },
          { color: '#94a3b8', label: 'Completed' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full border-2 border-white shadow" style={{ background: color }} />
            <span className={`text-[9px] font-bold uppercase tracking-wider ${subtitle}`}>{label}</span>
          </div>
        ))}
        <span className={`ml-auto text-[9px] font-bold ${subtitle}`}>
          {pinnedTickets.length} of {tickets.length} tickets mapped
        </span>
      </div>

      {/* Detail modal */}
      {detailTicket && (
        <InboundTicketDetail
          ticket={detailTicket}
          users={users}
          sessionUser={sessionUser}
          isAdmin={isAdmin}
          isDarkMode={dm}
          onClose={() => setDetailTicket(null)}
          onTicketUpdated={updated => {
            setTickets(prev => prev.map(t => t.id === updated.id ? updated : t));
            setDetailTicket(updated);
          }}
          onTicketDeleted={id => {
            setTickets(prev => prev.filter(t => t.id !== id));
            setDetailTicket(null);
          }}
        />
      )}
    </div>
  );
};

export default InboundMapView;
