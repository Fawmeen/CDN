import React from 'react';

const RING_CIRCUMFERENCE = 2 * Math.PI * 50; // 314.159...

export default function Metrics({
  totalRequests = 0,
  cacheHits = 0,
  cacheMisses = 0,
  bloomRejections = 0,
  hitRate = "0%"
}) {
  const hitRatePercent = parseFloat(hitRate) || 0;
  const strokeDashoffset = RING_CIRCUMFERENCE - (hitRatePercent / 100) * RING_CIRCUMFERENCE;

  return (
    <section className="panel sidebar">
      <h2>System Metrics</h2>
      <div className="hit-rate-container">
        <div className="circular-progress">
          <svg className="progress-ring" width="120" height="120">
            <circle
              className="progress-ring-bg"
              stroke="#1f293d"
              strokeWidth="8"
              fill="transparent"
              r="50"
              cx="60"
              cy="60"
            />
            <circle
              className="progress-ring-bar"
              stroke="var(--cyan)"
              strokeWidth="8"
              strokeDasharray={RING_CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="transparent"
              r="50"
              cx="60"
              cy="60"
            />
          </svg>
          <div className="progress-value">{hitRate}</div>
        </div>
        <p className="metric-label">Cache Hit Rate</p>
      </div>

      <div className="stats-list">
        <div className="stat-card">
          <span className="stat-num">{totalRequests}</span>
          <span className="stat-label">Total Requests</span>
        </div>
        <div className="stat-card hit">
          <span className="stat-num">{cacheHits}</span>
          <span className="stat-label">Cache Hits</span>
        </div>
        <div className="stat-card miss">
          <span className="stat-num">{cacheMisses}</span>
          <span className="stat-label">Origin Fetches</span>
        </div>
        <div className="stat-card reject">
          <span className="stat-num">{bloomRejections}</span>
          <span className="stat-label">Bloom Blocked</span>
        </div>
      </div>
    </section>
  );
}
