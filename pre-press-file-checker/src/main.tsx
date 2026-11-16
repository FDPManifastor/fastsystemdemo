import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const ProjectMap = lazy(() => import('./components/ProjectMap.tsx'));
const isMapRoute = window.location.pathname.replace(/\/+$/, '') === '/map';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isMapRoute ? (
      <Suspense fallback={null}>
        <ProjectMap />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
