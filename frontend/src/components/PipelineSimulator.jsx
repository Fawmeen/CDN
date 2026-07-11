import React from 'react';

export default function PipelineSimulator({
  filename,
  setFilename,
  onSendRequest,
  pipelineState,
  result,
  isSimulating
}) {
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!filename.trim()) {
      alert("Please enter a filename to fetch.");
      return;
    }
    onSendRequest(filename.trim());
  };

  const { client, cache, bloom, origin, arrow1, arrow2, arrow3 } = pipelineState;

  return (
    <section className="panel main-stage">
      <h2>CDN Pipeline Simulator</h2>
      <p className="subtitle">
        Request files from the CDN and watch how the Bloom Filter shields the Origin server from database lookups.
      </p>

      {/* Input area */}
      <form onSubmit={handleSubmit} className="simulator-input-area">
        <div className="input-wrapper">
          <span className="input-prefix">GET /files/</span>
          <input
            type="text"
            id="filename-input"
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            placeholder="Enter file name (e.g. img.jpg, attack.exe)"
            autoComplete="off"
            disabled={isSimulating}
          />
        </div>
        <button
          type="submit"
          id="btn-send-request"
          className="btn btn-primary"
          disabled={isSimulating}
        >
          Fetch File
        </button>
      </form>

      {/* Interactive Flow Diagram */}
      <div className="flow-diagram">
        {/* CLIENT NODE */}
        <div className={`flow-node client-node-ref ${client.highlight || 'active'}`} id="node-client">
          <div className="node-icon">💻</div>
          <div className="node-label">Client</div>
        </div>

        {/* CONNECTOR 1 (Client -> Cache) */}
        <svg className="flow-arrow" width="80" height="8" style={{ overflow: 'visible', flexGrow: 1, margin: '0 10px' }}>
          <line 
            x1="0" 
            y1="4" 
            x2="100%" 
            y2="4" 
            stroke={arrow1.active ? `var(--${arrow1.type})` : 'var(--border)'} 
            strokeWidth="2" 
            strokeDasharray={arrow1.active ? 'none' : '4 4'}
            className="arrow-line-1"
          />
          <circle 
            cx="0" 
            cy="4" 
            r="4" 
            fill={arrow1.type ? `var(--${arrow1.type})` : 'var(--cyan)'} 
            className="pulse-dot-1" 
            style={{ display: 'none' }} 
          />
        </svg>

        {/* CACHE NODE */}
        <div className={`flow-node cache-node-ref ${cache.highlight || 'active'}`} id="node-cache">
          <div className="node-icon">💾</div>
          <div className="node-label">Cache Directory</div>
          <span className="node-badge" id="badge-cache">
            {cache.badge}
          </span>
        </div>

        {/* CONNECTOR 2 (Cache -> Bloom) */}
        <svg className="flow-arrow" width="80" height="8" style={{ overflow: 'visible', flexGrow: 1, margin: '0 10px' }}>
          <line 
            x1="0" 
            y1="4" 
            x2="100%" 
            y2="4" 
            stroke={arrow2.active ? `var(--${arrow2.type})` : 'var(--border)'} 
            strokeWidth="2" 
            strokeDasharray={arrow2.active ? 'none' : '4 4'}
            className="arrow-line-2"
          />
          <circle 
            cx="0" 
            cy="4" 
            r="4" 
            fill={arrow2.type ? `var(--${arrow2.type})` : 'var(--cyan)'} 
            className="pulse-dot-2" 
            style={{ display: 'none' }} 
          />
        </svg>

        {/* BLOOM NODE */}
        <div className={`flow-node bloom-node-ref ${bloom.highlight || 'active'}`} id="node-bloom">
          <div className="node-icon">🛡️</div>
          <div className="node-label">Bloom Filter</div>
          <span className="node-badge" id="badge-bloom">
            {bloom.badge}
          </span>
        </div>

        {/* CONNECTOR 3 (Bloom -> Origin) */}
        <svg className="flow-arrow" width="80" height="8" style={{ overflow: 'visible', flexGrow: 1, margin: '0 10px' }}>
          <line 
            x1="0" 
            y1="4" 
            x2="100%" 
            y2="4" 
            stroke={arrow3.active ? `var(--${arrow3.type})` : 'var(--border)'} 
            strokeWidth="2" 
            strokeDasharray={arrow3.active ? 'none' : '4 4'}
            className="arrow-line-3"
          />
          <circle 
            cx="0" 
            cy="4" 
            r="4" 
            fill={arrow3.type ? `var(--${arrow3.type})` : 'var(--cyan)'} 
            className="pulse-dot-3" 
            style={{ display: 'none' }} 
          />
        </svg>

        {/* ORIGIN NODE */}
        <div className={`flow-node origin-node-ref ${origin.highlight || 'active'}`} id="node-origin">
          <div className="node-icon">🌐</div>
          <div className="node-label">Origin Database</div>
          <span className="node-badge" id="badge-origin">
            {origin.badge}
          </span>
        </div>
      </div>

      {/* Result Card */}
      {result && (
        <div className={`result-card ${result.cardClass}`}>
          <div className="result-header">
            <span className="result-status" id="result-status-badge">
              {result.statusBadge}
            </span>
            <span className="result-time" id="result-time-text">
              Response Time: {result.latency} ms
            </span>
          </div>
          <div className="result-body">
            <div id="result-content-container" className="result-content">
              {result.type === 'image' && (
                <img src={result.previewUrl} alt={result.filename} />
              )}
              {result.type === 'text' && (
                <pre className="result-text">{result.content}</pre>
              )}
              {result.type === 'reject_bloom' && (
                <div className="result-error">
                  <p>🔒 404 - Request Blocked at CDN Level</p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block', marginTop: '8px' }}>
                    The Bloom Filter evaluated "{result.filename}" and confirmed it does not exist in the Origin storage.
                    Zero database hits occurred.
                  </span>
                </div>
              )}
              {result.type === 'reject_false_positive' && (
                <div className="result-error">
                  <p>⚠️ 404 - File Not Found on Origin</p>
                  <span style={{ fontSize: '0.75rem', color: 'var(--muted-foreground)', display: 'block', marginTop: '8px' }}>
                    Bloom Filter calculated a probabilistic match (False Positive), but querying the Origin returned a 404.
                  </span>
                </div>
              )}
              {result.type === 'error' && (
                <div className="result-error">
                  <p>Network error: {result.content}</p>
                </div>
              )}
              {result.type === 'binary' && (
                <div className="result-text">[Binary File: {result.filename}]</div>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
