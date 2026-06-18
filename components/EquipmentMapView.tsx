
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { User, UserRecord, Job, DigTicket, InventoryItem, InventoryItemType, InventoryLocation } from '../types.ts';
import { apiService } from '../services/apiService.ts';

// Respect Nominatim's 1 request/second usage policy
const NOMINATIM_RATE_LIMIT_MS = 1100;

// Fix Leaflet default icon path issue with bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

interface EquipmentMapViewProps {
  sessionUser: User;
  users:       UserRecord[];
  jobs:        Job[];
  tickets:     DigTicket[];
  isAdmin:     boolean;
  isDarkMode?: boolean;
}

// A grouping of equipment that all share a single map location — either a job
// site or a shop (inventory location). Multiple pieces of equipment parked at
// the same place collapse into one marker so pins never stack on top of each
// other.
interface Placement {
  key:      string;
  kind:     'job' | 'shop';
  label:    string;        // job number or shop name
  sublabel: string;        // address shown beneath the label
  items:    InventoryItem[];
  lat?:     number;
  lng?:     number;
  geoQuery?: string;       // address to geocode when coords aren't known yet
}

const JOB_COLOR  = '#3b82f6'; // blue — equipment out on a job
const SHOP_COLOR = '#10b981'; // emerald — equipment at the shop

const createMarkerIcon = (kind: 'job' | 'shop', count: number) => {
  const color = kind === 'job' ? JOB_COLOR : SHOP_COLOR;
  return L.divIcon({
    className: '',
    html: `<div style="
      position:relative;width:26px;height:26px;border-radius:8px;
      background:${color};border:2px solid white;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      display:flex;align-items:center;justify-content:center;
      color:white;font-size:12px;font-weight:900;font-family:system-ui,sans-serif;
    ">${count}</div>`,
    iconSize:    [26, 26],
    iconAnchor:  [13, 13],
    popupAnchor: [0, -15],
  });
};

const geocodeAddress = async (query: string): Promise<{ lat: number; lng: number } | null> => {
  if (!query) return null;
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`,
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

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EquipmentMapView: React.FC<EquipmentMapViewProps> = ({
  jobs,
  tickets,
  users,
  isDarkMode = false,
}) => {
  const dm = isDarkMode;

  const mapDivRef  = useRef<HTMLDivElement>(null);
  const mapRef     = useRef<L.Map | null>(null);
  const markersRef = useRef<L.Marker[]>([]);

  const [items, setItems]         = useState<InventoryItem[]>([]);
  const [locations, setLocations] = useState<InventoryLocation[]>([]);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isGeocoding, setIsGeocoding]   = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [totalToGeocode, setTotalToGeocode] = useState(0);

  const jobMap  = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);
  const locMap  = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  // Look up a job's coordinates from any of its dig tickets that already carry
  // GPS/geocoded coords — saves a network round-trip whenever possible.
  const jobTicketCoords = useMemo(() => {
    const map = new Map<string, { lat: number; lng: number }>();
    for (const t of tickets) {
      if (t.lat != null && t.lng != null && !map.has(t.jobNumber)) {
        map.set(t.jobNumber, { lat: t.lat, lng: t.lng });
      }
    }
    return map;
  }, [tickets]);

  // ── Load equipment + shop locations ────────────────────────────────────────
  const loadData = useCallback(async () => {
    setIsLoading(true);
    setLoadError('');
    try {
      const [itemsRes, locsRes] = await Promise.all([
        apiService.getInventoryItems(),
        apiService.getInventoryLocations(),
      ]);
      setItems(itemsRes);
      setLocations(locsRes);
    } catch (err) {
      setLoadError((err as Error).message ?? 'Failed to load equipment.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Equipment that can't be put on the map (assigned to a person or sitting
  // nowhere with a known address) — surfaced in a list beneath the map.
  const equipment = useMemo(
    () => items.filter(i => i.itemType === InventoryItemType.EQUIPMENT),
    [items],
  );

  const unplaced = useMemo(() => {
    return equipment.filter(e => {
      if (e.currentJobId && jobMap.has(e.currentJobId)) return false;
      if (e.currentLocationId && locMap.get(e.currentLocationId)?.address) return false;
      return true;
    });
  }, [equipment, jobMap, locMap]);

  // ── Build placement groups and resolve coordinates ─────────────────────────
  // Re-runs when the underlying equipment / job / location set changes.
  const placementKey = useMemo(() => {
    return equipment
      .map(e => `${e.id}:${e.currentJobId ?? ''}:${e.currentLocationId ?? ''}:${e.updatedAt}`)
      .sort()
      .join('|') + `#${jobMap.size}#${locMap.size}#${jobTicketCoords.size}`;
  }, [equipment, jobMap, locMap, jobTicketCoords]);

  useEffect(() => {
    // Group equipment by destination (job site or shop).
    const groups = new Map<string, Placement>();

    for (const item of equipment) {
      let key: string | null = null;
      let placement: Placement | null = null;

      if (item.currentJobId && jobMap.has(item.currentJobId)) {
        const job = jobMap.get(item.currentJobId)!;
        key = `job:${job.id}`;
        if (!groups.has(key)) {
          const addressParts = [job.address, job.city, job.state].filter(Boolean);
          placement = {
            key,
            kind: 'job',
            label: `Job #${job.jobNumber}`,
            sublabel: addressParts.join(', ') || job.customer || '',
            items: [],
            geoQuery: addressParts.join(', '),
          };
          // Prefer coords already resolved on one of the job's dig tickets.
          const coords = jobTicketCoords.get(job.jobNumber);
          if (coords) { placement.lat = coords.lat; placement.lng = coords.lng; }
        }
      } else if (item.currentLocationId && locMap.get(item.currentLocationId)?.address) {
        const loc = locMap.get(item.currentLocationId)!;
        key = `shop:${loc.id}`;
        if (!groups.has(key)) {
          placement = {
            key,
            kind: 'shop',
            label: loc.name,
            sublabel: loc.address || '',
            items: [],
            geoQuery: loc.address || loc.name,
          };
        }
      }

      if (!key) continue; // unplaced — handled separately
      if (placement) groups.set(key, placement);
      groups.get(key)!.items.push(item);
    }

    const list = Array.from(groups.values());
    setPlacements(list);

    // Geocode any placements without known coordinates, honoring the rate limit.
    const needGeocode = list.filter(p => (p.lat == null || p.lng == null) && p.geoQuery);
    setTotalToGeocode(needGeocode.length);
    setGeocodedCount(0);

    if (needGeocode.length === 0) {
      setIsGeocoding(false);
      return;
    }

    setIsGeocoding(true);
    let cancelled = false;

    (async () => {
      for (const placement of needGeocode) {
        if (cancelled) break;
        const coords = await geocodeAddress(placement.geoQuery!);
        if (!cancelled) {
          if (coords) {
            setPlacements(prev => prev.map(p =>
              p.key === placement.key ? { ...p, lat: coords.lat, lng: coords.lng } : p,
            ));
          }
          setGeocodedCount(prev => prev + 1);
        }
        await new Promise(r => setTimeout(r, NOMINATIM_RATE_LIMIT_MS));
      }
      if (!cancelled) setIsGeocoding(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementKey]);

  // ── Initialize Leaflet map once ────────────────────────────────────────────
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

  // ── Render markers whenever placements change ──────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const positioned = placements.filter(p => p.lat != null && p.lng != null);
    if (positioned.length === 0) return;

    const bounds: [number, number][] = [];

    positioned.forEach((placement) => {
      const color = placement.kind === 'job' ? JOB_COLOR : SHOP_COLOR;
      const kindLabel = placement.kind === 'job' ? 'Job Site' : 'Shop';

      const itemsHtml = placement.items.map(it => {
        const detail = it.serialNumber || it.licensePlate || it.assetTag || '';
        return `
          <div style="display:flex;align-items:center;gap:6px;padding:3px 0;border-top:1px solid #f1f5f9;">
            <span style="width:6px;height:6px;border-radius:2px;background:${color};flex:none;"></span>
            <span style="font-size:12px;font-weight:700;color:#1e293b;">${escapeHtml(it.name)}</span>
            ${detail ? `<span style="font-size:10px;color:#94a3b8;margin-left:auto;">${escapeHtml(detail)}</span>` : ''}
          </div>`;
      }).join('');

      const popupHtml = `
        <div style="min-width:210px;font-family:system-ui,sans-serif;">
          <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:${color};margin-bottom:3px;">
            ${kindLabel} · ${placement.items.length} ${placement.items.length === 1 ? 'unit' : 'units'}
          </div>
          <div style="font-size:13px;font-weight:800;color:#0f172a;margin-bottom:1px;">${escapeHtml(placement.label)}</div>
          ${placement.sublabel ? `<div style="font-size:10px;color:#64748b;margin-bottom:4px;">${escapeHtml(placement.sublabel)}</div>` : ''}
          <div style="margin-top:4px;">${itemsHtml}</div>
        </div>`;

      const marker = L.marker([placement.lat!, placement.lng!], {
        icon: createMarkerIcon(placement.kind, placement.items.length),
      })
        .bindPopup(popupHtml)
        .addTo(map);

      markersRef.current.push(marker);
      bounds.push([placement.lat!, placement.lng!]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
    }
  }, [placements]);

  const subtitle = dm ? 'text-slate-500' : 'text-slate-400';
  const positionedCount = placements.filter(p => p.lat != null && p.lng != null).length;
  const mappedUnits = placements
    .filter(p => p.lat != null && p.lng != null)
    .reduce((sum, p) => sum + p.items.length, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Progress banner while geocoding */}
      {isGeocoding && (
        <div className="rounded-xl border px-5 py-3 flex items-center gap-3 bg-brand/5 border-brand/10">
          <div className="w-4 h-4 border-2 border-brand border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-[11px] font-black uppercase tracking-widest text-brand">
            Locating equipment… {geocodedCount} / {totalToGeocode}
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
            <button onClick={loadData} className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl ${dm ? 'bg-white/5 text-slate-300 hover:bg-white/10' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
              Retry
            </button>
          </div>
        )}
        {!isLoading && !loadError && equipment.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <p className={`text-[11px] font-black uppercase tracking-widest ${subtitle}`}>No equipment to map</p>
            <p className={`text-[10px] font-bold ${subtitle}`}>Add equipment in the Inventory tab and assign it to a job or shop.</p>
          </div>
        )}
        <div ref={mapDivRef} className="w-full h-full" />
      </div>

      {/* Legend */}
      <div className={`rounded-xl border px-5 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-100 shadow-sm'}`}>
        <span className={`text-[9px] font-black uppercase tracking-widest ${subtitle}`}>Marker Colors</span>
        {[
          { color: JOB_COLOR,  label: 'On a Job' },
          { color: SHOP_COLOR, label: 'At the Shop' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-[3px] border-2 border-white shadow" style={{ background: color }} />
            <span className={`text-[9px] font-bold uppercase tracking-wider ${subtitle}`}>{label}</span>
          </div>
        ))}
        <span className={`ml-auto text-[9px] font-bold ${subtitle}`}>
          {mappedUnits} of {equipment.length} units mapped · {positionedCount} {positionedCount === 1 ? 'location' : 'locations'}
        </span>
      </div>

      {/* Equipment that can't be placed on the map */}
      {unplaced.length > 0 && (
        <div className={`rounded-xl border px-5 py-4 ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-100 shadow-sm'}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest mb-3 ${subtitle}`}>
            Not on map ({unplaced.length})
          </p>
          <div className="flex flex-col gap-2">
            {unplaced.map(item => {
              const assignee = item.currentAssigneeId ? userMap.get(item.currentAssigneeId) : null;
              const where = assignee
                ? `With ${assignee.name}`
                : item.currentLocationId
                  ? 'Shop has no address'
                  : 'Unassigned';
              return (
                <div key={item.id} className="flex items-center gap-3">
                  <span className={`w-1.5 h-1.5 rounded-full flex-none ${dm ? 'bg-slate-600' : 'bg-slate-300'}`} />
                  <span className={`text-[12px] font-bold ${dm ? 'text-slate-200' : 'text-slate-700'}`}>{item.name}</span>
                  <span className={`ml-auto text-[10px] font-bold uppercase tracking-wider ${subtitle}`}>{where}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default EquipmentMapView;
