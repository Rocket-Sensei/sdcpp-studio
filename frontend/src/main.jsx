import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AppWithProviders } from './App.jsx';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AppWithProviders />
    </BrowserRouter>
  </StrictMode>,
);
