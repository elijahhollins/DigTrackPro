
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import ErrorBoundary from './components/ErrorBoundary.tsx';
import './index.css';

console.log("DigTrack Pro: Bootstrapping...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Critical: Root element not found");
} else {
  try {
    const root = createRoot(rootElement);
    // The try/catch below only covers the *initial* render; a later render
    // error would unmount the tree and leave a blank page, so the whole app
    // also sits inside an error boundary.
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
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
