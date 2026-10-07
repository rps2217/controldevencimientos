import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/common/ErrorBoundary.tsx';
import { migrateLegacyStorageKeys } from './utils/appStorage';
import './index.css';

migrateLegacyStorageKeys();

// Suppress harmless browser ResizeObserver loop errors (Recharts, Virtualizer, Resizable Panels)
const isResizeObserverError = (msg: unknown) => {
  const str = String(msg || '').toLowerCase();
  return str.includes('resizeobserver') || str.includes('undelivered notifications');
};

window.addEventListener('error', (e) => {
  const msg = e.message || (e.error && e.error.message) || '';
  if (isResizeObserverError(msg)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);

window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && (e.reason.message || String(e.reason))) || '';
  if (isResizeObserverError(msg)) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
