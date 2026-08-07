
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.log("DigTrack Pro: Bootstrapping...");

// Register the service worker so push notifications work at all. TeamManagement awaits
// `navigator.serviceWorker.ready`, which never resolves without a registration -- so without this
// the "Enable push notifications" button hangs forever with no error.
//
// The worker currently ships push handlers only, no fetch handler. Offline caching lands in a
// later change, deliberately decoupled: a broken fetch handler can permanently cache a broken
// app shell on every installed client, so registration is proven in production first.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('DigTrack Pro: Service worker registered.', registration.scope);
      })
      .catch((err) => {
        // Non-fatal: the app works fine without it, push notifications just stay unavailable.
        console.warn('DigTrack Pro: Service worker registration failed:', err);
      });
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Critical: Root element not found");
} else {
  try {
    const root = createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("DigTrack Pro: Application mounted.");
  } catch (err) {
    console.error("DigTrack Pro: Render crash:", err);
    rootElement.innerHTML = `<div style="padding: 40px; color: #e11d48; text-align: center;">
      <h1 style="font-size: 18px; font-weight: 900;">Application Error</h1>
      <p style="font-size: 14px; opacity: 0.7;">${err instanceof Error ? err.message : 'Unknown startup error'}</p>
      <button onclick="location.reload()" style="margin-top: 20px; padding: 10px 20px; background: #3b82f6; color: white; border-radius: 8px; border: none; font-weight: 800; cursor: pointer;">Retry Load</button>
    </div>`;
  }
}
