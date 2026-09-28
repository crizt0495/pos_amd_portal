import React from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

import './index.css';

const root = document.getElementById('root');
if (!root) throw new Error('Elemen #root tidak ditemukan.');

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
