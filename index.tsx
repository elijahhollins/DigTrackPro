import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';

console.log("DigTrack Pro: Index.tsx starting load...");

const rootElement = document.getElementById('root');
if (!rootElement) {
  console.error("Critical Error: Could not find root element in index.html");
} else {
  try {
    const root = createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("DigTrack Pro: React mounted successfully.");
  } catch (err) {
    console.error("DigTrack Pro: Mounting failed:", err);
    rootElement.innerHTML = `<div style="padding: 20px; color: #e11d48; font-family: sans-serif;">
      <h1 style="font-size: 14px; font-weight: 900;">Mounting Error</h1>
      <p style="font-size: 12px;">${err instanceof Error ? err.message : String(err)}</p>
    </div>`;
  }
}