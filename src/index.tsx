// Filename: src/index.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App.tsx'; // React จะ import ไฟล์ App.tsx มาให้เองโดยอัตโนมัติ

// เราบอก TypeScript ให้มั่นใจว่า document.getElementById('root')
// จะเจอ div ที่เป็น HTMLElement จริงๆ
const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);