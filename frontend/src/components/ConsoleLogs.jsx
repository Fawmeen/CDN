import React, { useEffect, useRef } from 'react';

export default function ConsoleLogs({ logs = [] }) {
  const consoleRef = useRef(null);

  // Automatically scroll to the top/bottom when new logs arrive (or standard console view)
  // The original JS inserted at the top of the logs console, or we can just render array reversed
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = 0;
    }
  }, [logs]);

  return (
    <div className="console-logs-container">
      <h3>Request Log Stream</h3>
      <div className="console-logs" ref={consoleRef}>
        {logs.map((log, index) => {
          const time = new Date(log.timestamp).toLocaleTimeString();
          
          if (log.type === 'system') {
            return (
              <div key={index} className="log-line system">
                [{time}] [System] {log.message}
              </div>
            );
          }

          let statusClass = (log.status || '').toLowerCase();
          if (log.status === "BLOOM_REJECT") statusClass = "reject";

          return (
            <div key={index} className={`log-line ${statusClass}`}>
              [{time}] GET /files/{log.filename} - <strong>{log.status}</strong> ({log.latency}ms)
            </div>
          );
        })}
        {logs.length === 0 && (
          <div className="log-line system">[System] Connection established. Edge Cache server ready.</div>
        )}
      </div>
    </div>
  );
}
