
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  User, UserRecord, Job, DigTicket,
  InventoryItem, InventoryItemType, InventoryLocation, InventoryMovementType,
} from '../types.ts';
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

// A grouping of inventory that shares a single map location — either a job
// site or a shop (inventory location). Multiple items parked at the same place
// collapse into one marker so pins never stack on top of each other.
// Structured address used for geocoding. Nominatim resolves these far more
// reliably than a single free-text line.
interface GeoInput {
  street?: string;
  city?:   string;
  state?:  string;
  zip?:    string;
}

const geoToText = (g: GeoInput): string =>
  [g.street, g.city, g.state, g.zip].map(s => s?.trim()).filter(Boolean).join(', ');

const locGeo = (l: InventoryLocation): GeoInput =>
  ({ street: l.address, city: l.city, state: l.state, zip: l.zip });

const locHasAddress = (l?: InventoryLocation | null): boolean =>
  !!l && geoToText(locGeo(l)).length > 0;

interface Placement {
  key:      string;
  kind:     'job' | 'shop';
  label:    string;        // job number or shop name
  sublabel: string;        // address shown beneath the label
  items:    InventoryItem[];
  lat?:     number;
  lng?:     number;
  geo?:     GeoInput;      // address to geocode when coords aren't known yet
}

const JOB_COLOR  = '#3b82f6'; // blue — out on a job
const SHOP_COLOR = '#10b981'; // emerald — at the shop

type TypeFilter = 'ALL' | InventoryItemType.EQUIPMENT | InventoryItemType.MATERIAL;

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

const parseHit = (data: any): { lat: number; lng: number } | null =>
  data?.length > 0 ? { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) } : null;

// Geocode an address, preferring Nominatim's structured search (street / city /
// state / postalcode) — the same high-accuracy path the dig-ticket map uses —
// and falling back to a free-text query when structured search comes up empty.
const geocodeAddress = async (geo: GeoInput): Promise<{ lat: number; lng: number } | null> => {
  const text = geoToText(geo);
  if (!text) return null;

  // Strategy 1: structured search (most accurate).
  if (geo.street || geo.city || geo.zip) {
    const params = new URLSearchParams({ format: 'json', limit: '1', countrycodes: 'us' });
    if (geo.street) params.set('street', geo.street.trim());
    if (geo.city)   params.set('city', geo.city.trim());
    if (geo.state)  params.set('state', geo.state.trim());
    if (geo.zip)    params.set('postalcode', geo.zip.trim());
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`,
        { headers: { 'Accept-Language': 'en' } });
      const hit = parseHit(await res.json());
      if (hit) return hit;
    } catch {
      // fall through to free-text
    }
    // Honor the rate limit between the two requests.
    await new Promise(r => setTimeout(r, NOMINATIM_RATE_LIMIT_MS));
  }

  // Strategy 2: free-text fallback.
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(text)}`,
      { headers: { 'Accept-Language': 'en' } },
    );
    const hit = parseHit(await res.json());
    if (hit) return hit;
  } catch {
    // Geocoding failed — return null
  }
  return null;
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EquipmentMapView: React.FC<EquipmentMapViewProps> = ({
  sessionUser,
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
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [relocating, setRelocating] = useState<InventoryItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [isGeocoding, setIsGeocoding]   = useState(false);
  const [geocodedCount, setGeocodedCount] = useState(0);
  const [totalToGeocode, setTotalToGeocode] = useState(0);

  // Cache resolved coordinates by geocode query so relocating one item doesn't
  // force every other shop placement to be geocoded again.
  const coordsCacheRef = useRef<Map<string, { lat: number; lng: number }>>(new Map());

  const jobMap  = useMemo(() => new Map(jobs.map(j => [j.id, j])), [jobs]);
  const locMap  = useMemo(() => new Map(locations.map(l => [l.id, l])), [locations]);
  const userMap = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);

  // The "default shop" is where otherwise-idle equipment is parked on the map.
  // Prefer the first location that has a usable address (so it can be geocoded);
  // fall back to the first location if none have an address yet.
  const defaultShop = useMemo(
    () => locations.find(l => geoToText(locGeo(l))) ?? locations[0] ?? null,
    [locations],
  );

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

  // Keep a live lookup + setter ref so popup buttons (raw HTML) can open the
  // relocate panel without re-binding every render.
  const itemsByIdRef = useRef<Map<string, InventoryItem>>(new Map());
  itemsByIdRef.current = new Map(items.map(i => [i.id, i]));
  const setRelocatingRef = useRef(setRelocating);
  setRelocatingRef.current = setRelocating;

  // ── Load inventory + shop locations ────────────────────────────────────────
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
      setLoadError((err as Error).message ?? 'Failed to load inventory.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const visibleItems = useMemo(
    () => items.filter(i => typeFilter === 'ALL' || i.itemType === typeFilter),
    [items, typeFilter],
  );

  // Items that can't be put on the map (assigned to a person, or sitting
  // nowhere with a known address) — surfaced in a list beneath the map.
  const unplaced = useMemo(() => {
    return visibleItems.filter(e => {
      if (e.currentJobId && jobMap.has(e.currentJobId)) return false;          // out on a job
      if (e.currentAssigneeId && !e.currentLocationId && userMap.has(e.currentAssigneeId)) {
        return true;                                                            // checked out to a crew member — can't be mapped
      }
      // Everything else defaults to a shop: its own addressed location, or the
      // default shop. It's only unmappable if no shop has an address at all.
      const ownLoc = e.currentLocationId ? locMap.get(e.currentLocationId) : undefined;
      const shop = locHasAddress(ownLoc) ? ownLoc : defaultShop;
      return !locHasAddress(shop);
    });
  }, [visibleItems, jobMap, locMap, userMap, defaultShop]);

  // ── Build placement groups and resolve coordinates ─────────────────────────
  const placementKey = useMemo(() => {
    const locFingerprint = locations.map(l => `${l.id}:${geoToText(locGeo(l))}`).join(',');
    return visibleItems
      .map(e => `${e.id}:${e.currentJobId ?? ''}:${e.currentLocationId ?? ''}:${e.currentAssigneeId ?? ''}:${e.updatedAt}`)
      .sort()
      .join('|') + `#${jobMap.size}#${locMap.size}#${jobTicketCoords.size}#${userMap.size}#${defaultShop?.id ?? ''}#${locFingerprint}`;
  }, [visibleItems, jobMap, locMap, userMap, jobTicketCoords, defaultShop, locations]);

  useEffect(() => {
    // Group inventory by destination (job site or shop).
    const groups = new Map<string, Placement>();
    const cache = coordsCacheRef.current;

    for (const item of visibleItems) {
      let key: string | null = null;
      let placement: Placement | null = null;

      if (item.currentJobId && jobMap.has(item.currentJobId)) {
        const job = jobMap.get(item.currentJobId)!;
        key = `job:${job.id}`;
        if (!groups.has(key)) {
          const geo: GeoInput = { street: job.address, city: job.city, state: job.state };
          const geoQuery = geoToText(geo);
          placement = {
            key, kind: 'job',
            label: `Job #${job.jobNumber}`,
            sublabel: geoQuery || job.customer || '',
            items: [], geo,
          };
          // Prefer coords already resolved on one of the job's dig tickets.
          const coords = jobTicketCoords.get(job.jobNumber) ?? (geoQuery ? cache.get(geoQuery) : undefined);
          if (coords) { placement.lat = coords.lat; placement.lng = coords.lng; }
        }
      } else if (item.currentAssigneeId && !item.currentLocationId && userMap.has(item.currentAssigneeId)) {
        // Checked out to a crew member with no shop — can't be mapped; shown in
        // the "Not on map" list instead.
        continue;
      } else {
        // Default to a shop: the item's own addressed location when it has one,
        // otherwise the company's default shop. This parks all otherwise-idle
        // equipment at the shop address and keeps the shop pinned on the map.
        const ownLoc = item.currentLocationId ? locMap.get(item.currentLocationId) : undefined;
        const shop = locHasAddress(ownLoc) ? ownLoc! : defaultShop;
        if (!locHasAddress(shop)) continue; // no shop with an address defined yet
        key = `shop:${shop!.id}`;
        if (!groups.has(key)) {
          const geo = locGeo(shop!);
          const geoQuery = geoToText(geo);
          placement = {
            key, kind: 'shop',
            label: shop!.name,
            sublabel: geoQuery,
            items: [], geo,
          };
          // Prefer the shop's persisted coordinates, then the in-session cache —
          // either lets us pin instantly without hitting Nominatim again.
          const coords = (shop!.lat != null && shop!.lng != null)
            ? { lat: shop!.lat, lng: shop!.lng }
            : cache.get(geoQuery);
          if (coords) { placement.lat = coords.lat; placement.lng = coords.lng; }
        }
      }

      if (!key) continue; // unplaced — handled separately
      if (placement) groups.set(key, placement);
      groups.get(key)!.items.push(item);
    }

    const list = Array.from(groups.values());
    setPlacements(list);

    // Geocode any placements without known coordinates, honoring the rate limit.
    const needGeocode = list.filter(p => (p.lat == null || p.lng == null) && p.geo && geoToText(p.geo));
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
        const coords = await geocodeAddress(placement.geo!);
        if (!cancelled) {
          if (coords) {
            cache.set(geoToText(placement.geo!), coords);
            setPlacements(prev => prev.map(p =>
              p.key === placement.key ? { ...p, lat: coords.lat, lng: coords.lng } : p,
            ));
            // Persist a shop's position so it pins instantly next session instead
            // of re-geocoding — the root cause of the map getting stuck on
            // "Locating…" when Nominatim throttles repeat requests.
            if (placement.key.startsWith('shop:')) {
              const locId = placement.key.slice('shop:'.length);
              setLocations(prev => prev.map(l =>
                l.id === locId ? { ...l, lat: coords.lat, lng: coords.lng } : l,
              ));
              apiService.updateLocationCoords(locId, coords.lat, coords.lng).catch(err =>
                console.error('Failed to persist shop coordinates for location', locId, err),
              );
            }
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
        const isMat = it.itemType === InventoryItemType.MATERIAL;
        const detail = isMat
          ? `${it.quantity} ${escapeHtml(it.unit || 'each')}`
          : (it.serialNumber || it.licensePlate || it.assetTag || '');
        return `
          <div style="display:flex;align-items:center;gap:8px;padding:5px 0;border-top:1px solid #f1f5f9;">
            <span style="width:6px;height:6px;border-radius:${isMat ? '50%' : '2px'};background:${color};flex:none;"></span>
            <span style="font-size:12px;font-weight:700;color:#1e293b;flex:1;min-width:0;">${escapeHtml(it.name)}</span>
            ${detail ? `<span style="font-size:10px;color:#94a3b8;">${detail}</span>` : ''}
            <button data-equip-move="${it.id}" style="
              padding:3px 8px;background:#7c3aed;color:white;border:none;border-radius:6px;
              font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.06em;cursor:pointer;flex:none;
            ">Move</button>
          </div>`;
      }).join('');

      const popupHtml = `
        <div style="min-width:240px;font-family:system-ui,sans-serif;">
          <div style="font-size:9px;font-weight:900;text-transform:uppercase;letter-spacing:0.1em;color:${color};margin-bottom:3px;">
            ${kindLabel} · ${placement.items.length} ${placement.items.length === 1 ? 'item' : 'items'}
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

      // Wire each "Move" button to open the relocate panel.
      marker.on('popupopen', () => {
        const el = marker.getPopup()?.getElement();
        el?.querySelectorAll<HTMLButtonElement>('button[data-equip-move]').forEach(btn => {
          btn.onclick = () => {
            const item = itemsByIdRef.current.get(btn.dataset.equipMove!);
            if (item) { marker.closePopup(); setRelocatingRef.current(item); }
          };
        });
      });

      markersRef.current.push(marker);
      bounds.push([placement.lat!, placement.lng!]);
    });

    if (bounds.length > 0) {
      map.fitBounds(bounds as L.LatLngBoundsExpression, { padding: [40, 40], maxZoom: 14 });
    }
  }, [placements]);

  // Apply a completed relocation to local state so the map updates instantly.
  const handleMoved = useCallback((updated: InventoryItem) => {
    setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
    setRelocating(null);
  }, []);

  const subtitle = dm ? 'text-slate-500' : 'text-slate-400';
  const positionedCount = placements.filter(p => p.lat != null && p.lng != null).length;
  const mappedItems = placements
    .filter(p => p.lat != null && p.lng != null)
    .reduce((sum, p) => sum + p.items.length, 0);

  const filterChips: Array<{ id: TypeFilter; label: string }> = [
    { id: 'ALL', label: 'All' },
    { id: InventoryItemType.EQUIPMENT, label: 'Equipment' },
    { id: InventoryItemType.MATERIAL, label: 'Materials' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Type filter + geocoding progress */}
      <div className="flex flex-wrap items-center gap-3">
        <div className={`flex rounded-xl border p-0.5 gap-0.5 w-fit ${dm ? 'bg-[#0b1629] border-white/[0.08]' : 'bg-slate-100 border-slate-200'}`}>
          {filterChips.map(chip => (
            <button
              key={chip.id}
              onClick={() => setTypeFilter(chip.id)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                typeFilter === chip.id
                  ? dm ? 'bg-brand/20 text-brand border border-brand/25' : 'bg-white text-brand shadow-sm border border-slate-200'
                  : dm ? 'text-slate-600 hover:text-slate-300' : 'text-slate-400 hover:text-slate-700'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        {isGeocoding && (
          <div className="flex items-center gap-2 px-4 py-2 bg-brand/10 border border-brand/20 rounded-xl text-[10px] font-black uppercase tracking-widest text-brand">
            <div className="w-2 h-2 bg-brand rounded-full animate-ping" />
            Locating {geocodedCount}/{totalToGeocode}
          </div>
        )}
      </div>

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
        {!isLoading && !loadError && visibleItems.length === 0 && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 pointer-events-none">
            <p className={`text-[11px] font-black uppercase tracking-widest ${subtitle}`}>Nothing to map</p>
            <p className={`text-[10px] font-bold ${subtitle}`}>Add inventory in the Inventory tab and assign it to a job or shop.</p>
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
          {mappedItems} of {visibleItems.length} mapped · {positionedCount} {positionedCount === 1 ? 'location' : 'locations'}
        </span>
      </div>

      {/* Inventory that can't be placed on the map */}
      {unplaced.length > 0 && (
        <div className={`rounded-xl border px-5 py-4 ${dm ? 'bg-[#0b1629] border-white/[0.06]' : 'bg-white border-slate-100 shadow-sm'}`}>
          <p className={`text-[9px] font-black uppercase tracking-widest mb-3 ${subtitle}`}>
            Not on map ({unplaced.length})
          </p>
          <div className="flex flex-col gap-1">
            {unplaced.map(item => {
              const assignee = item.currentAssigneeId ? userMap.get(item.currentAssigneeId) : null;
              const where = assignee
                ? `With ${assignee.name}`
                : item.currentLocationId
                  ? 'Shop has no address'
                  : 'Unassigned';
              return (
                <div key={item.id} className={`group flex items-center gap-3 -mx-2 px-2 py-1.5 rounded-lg ${dm ? 'hover:bg-white/5' : 'hover:bg-slate-50'}`}>
                  <span className={`w-1.5 h-1.5 flex-none ${item.itemType === InventoryItemType.MATERIAL ? 'rounded-full' : 'rounded-sm'} ${dm ? 'bg-slate-600' : 'bg-slate-300'}`} />
                  <span className={`text-[12px] font-bold ${dm ? 'text-slate-200' : 'text-slate-700'}`}>{item.name}</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wider ${subtitle}`}>{where}</span>
                  <button
                    onClick={() => setRelocating(item)}
                    className="ml-auto px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest bg-brand/15 text-brand hover:bg-brand/25 transition-all"
                  >
                    Move
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Relocate panel */}
      {relocating && (
        <RelocateModal
          item={relocating}
          jobs={jobs}
          locations={locations}
          users={users}
          sessionUser={sessionUser}
          jobMap={jobMap}
          locMap={locMap}
          userMap={userMap}
          isDarkMode={dm}
          onClose={() => setRelocating(null)}
          onMoved={handleMoved}
        />
      )}
    </div>
  );
};

// ── Relocate modal ───────────────────────────────────────────────────────────

interface RelocateModalProps {
  item:        InventoryItem;
  jobs:        Job[];
  locations:   InventoryLocation[];
  users:       UserRecord[];
  sessionUser: User;
  jobMap:      Map<string, Job>;
  locMap:      Map<string, InventoryLocation>;
  userMap:     Map<string, UserRecord>;
  isDarkMode:  boolean;
  onClose:     () => void;
  onMoved:     (updated: InventoryItem) => void;
}

type DestKind = 'job' | 'shop' | 'person';

const RelocateModal: React.FC<RelocateModalProps> = ({
  item, jobs, locations, users, sessionUser, jobMap, locMap, userMap, isDarkMode, onClose, onMoved,
}) => {
  const d = (dark: string, light: string) => isDarkMode ? dark : light;

  const currentKind: DestKind = item.currentJobId ? 'job' : item.currentAssigneeId ? 'person' : 'shop';
  const [dest, setDest] = useState<DestKind>(currentKind);
  const [jobId, setJobId] = useState(item.currentJobId || '');
  const [locationId, setLocationId] = useState(item.currentLocationId || '');
  const [assigneeId, setAssigneeId] = useState(item.currentAssigneeId || '');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');

  const activeJobs = useMemo(() => jobs.filter(j => !j.isComplete), [jobs]);

  // Describe where the item is right now.
  const currentLabel = item.currentJobId
    ? `Job #${jobMap.get(item.currentJobId)?.jobNumber ?? '—'}`
    : item.currentAssigneeId
      ? `With ${userMap.get(item.currentAssigneeId)?.name ?? 'crew'}`
      : item.currentLocationId
        ? (locMap.get(item.currentLocationId)?.name ?? 'Shop')
        : 'Unassigned';

  const inputCls = d(
    'w-full px-3 py-2.5 border rounded-xl text-[12px] font-medium outline-none bg-white/5 border-white/10 text-white focus:border-brand/50',
    'w-full px-3 py-2.5 border rounded-xl text-[12px] font-medium outline-none bg-slate-50 border-slate-200 text-slate-900 focus:border-brand/50',
  );

  const destOptions: Array<{ id: DestKind; label: string; icon: React.ReactNode }> = [
    { id: 'job',    label: 'Job Site', icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z" /> },
    { id: 'shop',   label: 'Shop',     icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z M9 22V12h6v10" /> },
    { id: 'person', label: 'Crew',     icon: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0z M12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /> },
  ];

  const handleSave = async () => {
    setError('');
    // Validate the chosen destination.
    if (dest === 'job' && !jobId)       { setError('Pick a job.'); return; }
    if (dest === 'shop' && !locationId) { setError('Pick a shop location.'); return; }
    if (dest === 'person' && !assigneeId) { setError('Pick a crew member.'); return; }

    setIsSaving(true);
    try {
      const job = dest === 'job' ? jobMap.get(jobId) : undefined;
      const assignee = dest === 'person' ? userMap.get(assigneeId) : undefined;
      const movementType =
        dest === 'job'    ? InventoryMovementType.CHECK_OUT :
        dest === 'person' ? InventoryMovementType.ASSIGN    :
                            InventoryMovementType.TRANSFER;

      await apiService.addInventoryMovement({
        companyId: sessionUser.companyId,
        itemId: item.id,
        movementType,
        performedById: sessionUser.id,
        performedByName: sessionUser.name,
        jobId: dest === 'job' ? jobId : undefined,
        jobNumber: job?.jobNumber,
        fromLocationId: item.currentLocationId || undefined,
        toLocationId: dest === 'shop' ? locationId : undefined,
        assigneeId: dest === 'person' ? assigneeId : undefined,
        assigneeName: assignee?.name,
        notes,
      });

      // Set the chosen destination and clear the other two so the item lives in
      // exactly one place.
      const saved = await apiService.saveInventoryItem({
        ...item,
        currentJobId:      dest === 'job' ? jobId : undefined,
        currentLocationId: dest === 'shop' ? locationId : undefined,
        currentAssigneeId: dest === 'person' ? assigneeId : undefined,
      });
      onMoved(saved);
    } catch (e: any) {
      setError(e.message || 'Failed to move item.');
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[2000] flex items-center justify-center p-4" onClick={onClose}>
      <div
        className={`w-full max-w-md rounded-[2rem] shadow-2xl border p-8 space-y-5 ${d('bg-[#1e293b] border-white/10', 'bg-white border-slate-200')}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-brand">Move Item</p>
            <h3 className={`text-[16px] font-black ${d('text-white', 'text-slate-900')}`}>{item.name}</h3>
            <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${d('text-slate-500', 'text-slate-400')}`}>
              Currently: {currentLabel}
            </p>
          </div>
          <button onClick={onClose} className={`p-2 rounded-xl ${d('text-slate-500 hover:text-white hover:bg-white/10', 'text-slate-400 hover:text-slate-700 hover:bg-slate-100')}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Destination type */}
        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Move To</p>
          <div className="grid grid-cols-3 gap-1.5">
            {destOptions.map(opt => (
              <button
                key={opt.id}
                onClick={() => setDest(opt.id)}
                className={`flex flex-col items-center gap-1.5 py-3 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                  dest === opt.id
                    ? 'bg-brand/15 text-brand border-brand/30'
                    : d('border-white/10 text-slate-500 hover:border-white/20 hover:text-slate-300', 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-700')
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">{opt.icon}</svg>
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Destination target */}
        {dest === 'job' && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Job</p>
            <select className={inputCls} value={jobId} onChange={e => setJobId(e.target.value)}>
              <option value="">— Select job —</option>
              {activeJobs.map(j => <option key={j.id} value={j.id}>#{j.jobNumber} — {j.customer}</option>)}
            </select>
            {activeJobs.length === 0 && <p className={d('text-[10px] text-slate-600', 'text-[10px] text-slate-400')}>No active jobs available.</p>}
          </div>
        )}
        {dest === 'shop' && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Shop Location</p>
            <select className={inputCls} value={locationId} onChange={e => setLocationId(e.target.value)}>
              <option value="">— Select location —</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {locations.length === 0 && <p className={d('text-[10px] text-slate-600', 'text-[10px] text-slate-400')}>No shop locations defined yet.</p>}
          </div>
        )}
        {dest === 'person' && (
          <div className="space-y-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Crew Member</p>
            <select className={inputCls} value={assigneeId} onChange={e => setAssigneeId(e.target.value)}>
              <option value="">— Select crew member —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Notes (optional)</p>
          <textarea className={`${inputCls} resize-none`} rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. moved with the trailer" />
        </div>

        {error && <p className="text-[11px] font-bold text-rose-400">{error}</p>}

        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className={`flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-all ${d('border-white/10 text-slate-500 hover:text-slate-200', 'border-slate-200 text-slate-500 hover:text-slate-700')}`}>Cancel</button>
          <button onClick={handleSave} disabled={isSaving} className="flex-1 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest bg-brand text-[#07101f] hover:opacity-90 disabled:opacity-50 transition-all">
            {isSaving ? 'Moving…' : 'Move Here'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default EquipmentMapView;
