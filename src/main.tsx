import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initSentry } from './lib/sentry';
import { Capacitor } from '@capacitor/core';

initSentry();

const isPreviewOrDev = 
  typeof window !== 'undefined' && 
  (window.location.hostname.includes('run.app') || 
   window.location.hostname === 'localhost' || 
   window.location.hostname === '127.0.0.1');

if ('serviceWorker' in navigator && (Capacitor.isNativePlatform() || isPreviewOrDev)) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => registration.unregister());
  });
  if ('caches' in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
} else if ('serviceWorker' in navigator && import.meta.env.PROD && !isPreviewOrDev) {
  window.addEventListener('load', () => {
    const swPath = `${import.meta.env.BASE_URL}sw.js`;
    navigator.serviceWorker.register(swPath).catch(err => {
      console.log('SW registration notice: ', err);
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
