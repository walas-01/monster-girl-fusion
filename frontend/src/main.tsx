import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { googleClientId } from './config';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode><App clientId={googleClientId(import.meta.env.VITE_GOOGLE_CLIENT_ID)} /></StrictMode>,
);
