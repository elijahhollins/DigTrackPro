import L from 'leaflet';

/**
 * Shared Leaflet setup for the app's three OpenStreetMap views (dig tickets,
 * inbound tickets, equipment).
 */

export interface AppMapHandle {
  map: L.Map;
  /** True once the user has panned or zoomed the map themselves. */
  hasUserAdjustedView: () => boolean;
  /**
   * Run a view change the app initiated (fitBounds, invalidateSize) without it
   * counting as a user adjustment.
   */
  runProgrammaticViewChange: (fn: () => void) => void;
}

/**
 * Create a map with the app's standard OSM tile layer and touch behaviour.
 *
 * `zoomSnap: 0` is what makes pinch-to-zoom usable on phones. With Leaflet's
 * default of 1, the zoom a pinch reaches is rounded to the nearest whole level
 * when the fingers lift, so any pinch that spreads them less than ~1.41x lands
 * back exactly where it started — the map looks like it ignores pinch entirely.
 * Free zoom keeps whatever the gesture produced; the +/- buttons and keyboard
 * still step by whole levels via `zoomDelta`.
 */
export const createAppMap = (
  container: HTMLElement,
  center: L.LatLngExpression,
  zoom: number,
): AppMapHandle => {
  const map = L.map(container, {
    zoomControl: true,
    touchZoom: true,
    zoomSnap: 0,
    zoomDelta: 1,
  }).setView(center, zoom);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }).addTo(map);

  // iOS Safari raises its own `gesture*` events for a two-finger pinch and uses
  // them to zoom the whole page. Suppressing them over the map container leaves
  // the gesture to Leaflet's touch handler.
  const preventGesture = (e: Event) => e.preventDefault();
  container.addEventListener('gesturestart', preventGesture);
  container.addEventListener('gesturechange', preventGesture);
  container.addEventListener('gestureend', preventGesture);
  map.on('unload', () => {
    container.removeEventListener('gesturestart', preventGesture);
    container.removeEventListener('gesturechange', preventGesture);
    container.removeEventListener('gestureend', preventGesture);
  });

  // Once the user has framed the map themselves, automatic re-framing must stop
  // fighting them — otherwise a background refresh (geocoding progress, a
  // parent re-render) snaps the view back mid-gesture. Leaflet fires
  // movestart/zoomstart synchronously from setView/fitBounds, so anything that
  // arrives outside `runProgrammaticViewChange` came from a user gesture.
  let userAdjustedView = false;
  let isProgrammatic = false;
  map.on('movestart zoomstart', () => {
    if (!isProgrammatic) userAdjustedView = true;
  });

  return {
    map,
    hasUserAdjustedView: () => userAdjustedView,
    runProgrammaticViewChange: (fn: () => void) => {
      isProgrammatic = true;
      try {
        fn();
      } finally {
        isProgrammatic = false;
      }
    },
  };
};
