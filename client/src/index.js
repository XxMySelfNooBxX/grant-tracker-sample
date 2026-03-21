import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import { GoogleOAuthProvider } from '@react-oauth/google';

const root = ReactDOM.createRoot(document.getElementById('root'));

// Your copied Client ID from GCP
const GCP_CLIENT_ID = "214173355980-h6asrend2u8pl369tgo9eu2157hhavu0.apps.googleusercontent.com"; 

root.render(
  <React.StrictMode>
    <GoogleOAuthProvider clientId={GCP_CLIENT_ID}>
      <App />
    </GoogleOAuthProvider>
  </React.StrictMode>
);