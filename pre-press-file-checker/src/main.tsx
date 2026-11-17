import {StrictMode, lazy, Suspense} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

const ProjectMap = lazy(() => import('./components/ProjectMap.tsx'));
const DraftUploadPage = lazy(() => import('./components/DraftUploadPage.tsx'));
const isUploadRoute = window.location.pathname.replace(/\/+$/, '') === '/upload';
const isMapRoute = window.location.pathname.replace(/\/+$/, '') === '/map';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isUploadRoute ? (
      <Suspense fallback={null}>
        <DraftUploadPage />
      </Suspense>
    ) : isMapRoute ? (
      <Suspense fallback={null}>
        <ProjectMap />
      </Suspense>
    ) : (
      <App />
    )}
  </StrictMode>,
);
