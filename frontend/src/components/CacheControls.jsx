import React from 'react';

export default function CacheControls({ onFlushCache, onRebuildFilter, isLoading = false }) {
  return (
    <div className="admin-actions">
      <h3>Cache Controls</h3>
      <button 
        onClick={onFlushCache} 
        className="btn btn-secondary"
        disabled={isLoading}
      >
        <span className="btn-icon">🗑️</span> Flush Edge Cache
      </button>
      <button 
        onClick={onRebuildFilter} 
        className="btn btn-secondary"
        disabled={isLoading}
      >
        <span className="btn-icon">🔄</span> Rebuild Bloom Filter
      </button>
    </div>
  );
}
