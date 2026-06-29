import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { App } from './App';

const STORAGE_KEY = 'sg-landing-theme';

/** Apply saved or system theme before first render to avoid flash. */
function initTheme() {
  const saved = localStorage.getItem(STORAGE_KEY) as 'dark' | 'light' | null;
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved ?? (prefersDark ? 'dark' : 'light');
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

initTheme();

const root = document.getElementById('root');
if (!root) throw new Error('Root element not found');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
