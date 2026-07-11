import React from 'react';

export default function ConceptFooter() {
  return (
    <footer>
      <div className="footer-grid">
        <div className="concept-card">
          <h4>🔬 Bloom Filter Mechanism</h4>
          <p>
            A space-efficient probabilistic data structure. At startup, the CDN server indexes all available origin file names using multiple hash functions. When a file is requested, the Bloom filter verifies its existence first. If the filter returns <code>false</code>, the file is guaranteed <strong>not to exist</strong>, and we reject the request immediately without hammering the origin database.
          </p>
        </div>
        <div className="concept-card">
          <h4>⚡ Preventing Cache-Penetration Attacks</h4>
          <p>
            In standard caching systems, if an attacker queries thousands of non-existent keys (e.g. <code>/files/random-uuid</code>), every single query results in a cache miss and forces the application to perform a database lookup. This exhausts the database connections. By shielding the application with a Bloom Filter at the Edge Cache level, fake queries are blocked in <strong>&lt; 1 millisecond</strong>, completely safeguarding the database.
          </p>
        </div>
        <div className="concept-card">
          <h4>🛠️ CDN Routing Workflow</h4>
          <p>
            1) Check local CDN Cache folder. If found (<strong>Cache Hit</strong>), serve instantly. 2) If not found (<strong>Cache Miss</strong>), query the Bloom Filter. 3) If Bloom Filter rejects, return 404. 4) If Bloom Filter accepts, fetch from the Origin server, save in the local CDN Cache, and serve to the client.
          </p>
        </div>
      </div>
    </footer>
  );
}
