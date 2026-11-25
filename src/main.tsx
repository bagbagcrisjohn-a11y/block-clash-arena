import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        // Proactively check for updated cached game shell when online
        if (navigator.onLine) {
          void reg.update().catch(() => undefined);
        }
      })
      .catch(() => {
        // Non-fatal in environments that restrict service workers
      });
  });
}

