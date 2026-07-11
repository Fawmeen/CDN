import React from 'react';

export default function Header({ cdnPort = 5000, originPort = 9000 }) {
  return (
    <header>
      <div className="logo-area">
        <span className="logo-icon">⚡</span>
        <div className="logo-text">
          <h1>EdgeCache</h1>
          <p>CDN Simulator & Bloom Filter Guard</p>
        </div>
      </div>
      <div className="status-pill-container">
        <div className="status-pill">
          <span className="pulse-green"></span>
          CDN: <strong>Port {cdnPort}</strong>
        </div>
        <div className="status-pill">
          <span className="pulse-blue"></span>
          Origin: <strong>Port {originPort}</strong>
        </div>
      </div>
    </header>
  );
}
