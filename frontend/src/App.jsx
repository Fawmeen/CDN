import React, { useState, useEffect } from 'react';
import { gsap } from 'gsap';
import Header from './components/Header';
import Metrics from './components/Metrics';
import CacheControls from './components/CacheControls';
import PipelineSimulator from './components/PipelineSimulator';
import InventoryTabs from './components/InventoryTabs';
import ConsoleLogs from './components/ConsoleLogs';
import ConceptFooter from './components/ConceptFooter';

// Default configuration settings for the visual pipeline node simulator animation
const INITIAL_PIPELINE_STATE = {
  client: { highlight: '' },
  cache: { badge: 'Check', highlight: '' },
  bloom: { badge: 'Verify', highlight: '' },
  origin: { badge: 'Origin', highlight: '' },
  arrow1: { active: false, type: '' },
  arrow2: { active: false, type: '' },
  arrow3: { active: false, type: '' }
};

// Helper utility: Promisified setTimeout to easily trigger step-by-step delays in animation
const triggerDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function App() {
  // --- STATE DEFINITIONS ---

  // User input inside the GET /files/ search bar
  const [filename, setFilename] = useState('');
  
  // Tracks if the simulated fetch animation is currently running (disables buttons)
  const [isSimulating, setIsSimulating] = useState(false);
  
  // Controls class highlights and badge texts of the interactive pipeline flow nodes/arrows
  const [pipelineState, setPipelineState] = useState(INITIAL_PIPELINE_STATE);
  
  // Renders the final results of the simulation query (HIT, MISS, BLOCKED, FALSE POSITIVE)
  const [simulationResult, setSimulationResult] = useState(null);

  // System stats (Total requests, Cache hit counts, misses, hit rate ratio)
  const [systemMetrics, setSystemMetrics] = useState({
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    bloomRejections: 0,
    hitRate: '0%'
  });

  // Inventories: files currently saved on the Origin (MySQL) and CDN Cache directory (disk)
  const [originDatabaseFiles, setOriginDatabaseFiles] = useState([]);
  const [cachedCdnFiles, setCachedCdnFiles] = useState([]);
  const [totalCacheSize, setTotalCacheSize] = useState('0.00 KB');

  // Logs stream: Request logs fetched from backend and administrative system events logged locally
  const [backendRequestLogs, setBackendRequestLogs] = useState([]);
  const [systemActionLogs, setSystemActionLogs] = useState([]);

  // File upload form states
  const [uploadStatusMessage, setUploadStatusMessage] = useState('');
  const [uploadStatusType, setUploadStatusType] = useState('');
  const [isUploadingInProgress, setIsUploadingInProgress] = useState(false);


  // --- EFFECT HOOKS ---

  // Fetch initial files lists and system stats when dashboard mounts.
  // Sets up a polling interval that updates backend stats every 5 seconds to sync concurrent operations.
  useEffect(() => {
    fetchSystemStats();
    fetchOriginFiles();

    const pollingTimer = setInterval(fetchSystemStats, 5000);

    // GSAP Entry Animation: Fade in all cards with a clean staggered upward slide
    gsap.fromTo('.panel', 
      { opacity: 0, y: 30 }, 
      { opacity: 1, y: 0, duration: 0.6, stagger: 0.1, ease: 'power2.out' }
    );

    return () => clearInterval(pollingTimer);
  }, []);


  // --- API SERVICE INTERACTIONS ---

  // Fetches CDN server cache sizes, request counts, and request logs
  const fetchSystemStats = async () => {
    try {
      const response = await fetch('/files/api/stats');
      if (!response.ok) throw new Error('Stats fetch operation failed');
      const data = await response.json();
      
      setSystemMetrics(data.metrics);
      setTotalCacheSize(`${data.cacheSizeKB} KB`);
      setCachedCdnFiles(data.cachedFilesList || []);
      setBackendRequestLogs(data.logs || []);
    } catch (err) {
      console.error('Error retrieving system statistics:', err);
    }
  };

  // Fetches the inventory of filenames and details stored on the origin database
  const fetchOriginFiles = async () => {
    try {
      const response = await fetch('/files/api/origin-files');
      if (!response.ok) throw new Error('Origin files fetch operation failed');
      const data = await response.json();
      setOriginDatabaseFiles(data.details || []);
    } catch (err) {
      console.error('Error retrieving origin file inventory:', err);
    }
  };

  // Helper to add a system event message locally to the console log stream
  const recordSystemEventLog = (message) => {
    setSystemActionLogs((prevLogs) => [
      {
        type: 'system',
        timestamp: new Date().toISOString(),
        message
      },
      ...prevLogs
    ]);
  };

  // Trigger: Flushes the CDN cache folder on disk
  const handleFlushCache = async () => {
    if (window.confirm('Are you sure you want to flush the CDN cache?')) {
      try {
        const response = await fetch('/files/api/clear-cache', { method: 'POST' });
        const data = await response.json();
        recordSystemEventLog(data.message || 'Edge Cache flushed successfully');
        await fetchSystemStats();
      } catch (err) {
        recordSystemEventLog('Failed to flush cache: ' + err.message);
      }
    }
  };

  // Trigger: Rebuilds the Bloom Filter using current list of files in origin database
  const handleRebuildFilter = async () => {
    try {
      const response = await fetch('/files/api/rebuild-filter', { method: 'POST' });
      const data = await response.json();
      recordSystemEventLog(data.message || 'Bloom filter successfully rebuilt');
      await fetchSystemStats();
    } catch (err) {
      recordSystemEventLog('Failed to rebuild Bloom filter: ' + err.message);
    }
  };

  // Trigger: Uploads a file to the Origin Server (which saves it into MySQL and registers it in the Bloom Filter)
  const handleUploadFile = async (file) => {
    setUploadStatusMessage('Uploading asset to database...');
    setUploadStatusType('');
    setIsUploadingInProgress(true);

    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const response = await fetch('/files/api/upload', {
        method: 'POST',
        body: uploadFormData
      });

      const data = await response.json();
      if (response.ok) {
        setUploadStatusMessage('File uploaded and registered in Bloom filter successfully!');
        setUploadStatusType('success');
        recordSystemEventLog(`Uploaded file "${data.filename}" directly to origin database.`);

        await fetchOriginFiles();
        await fetchSystemStats();
        setIsUploadingInProgress(false);
        return true;
      } else {
        throw new Error(data.error || 'Upload failed');
      }
    } catch (err) {
      setUploadStatusMessage(err.message);
      setUploadStatusType('error');
      setIsUploadingInProgress(false);
      return false;
    }
  };

  // Clicking an item in the file list copies it into the input and runs the simulator query
  const handleFileClick = (clickedFilename) => {
    setFilename(clickedFilename);
    handleSendRequest(clickedFilename);
  };


  // --- ANIMATED SIMULATION PIPELINE ENGINE (GSAP POWERED) ---

  // Drives the step-by-step visual animation timeline of the CDN routing request
  const handleSendRequest = async (targetFilename) => {
    if (isSimulating) return;
    setIsSimulating(true);
    setSimulationResult(null);
    setPipelineState(INITIAL_PIPELINE_STATE);

    const simulationStartTime = performance.now();

    // STEP 1: Activate Client Node (Bounce scale)
    gsap.fromTo('.client-node-ref', 
      { scale: 0.92 }, 
      { scale: 1.05, duration: 0.25, yoyo: true, repeat: 1, ease: 'power1.out' }
    );

    // Activate Client -> Cache Arrow line & animate pulse dot
    setPipelineState((prev) => ({
      ...prev,
      client: { highlight: 'highlight-cyan' },
      arrow1: { active: true, type: 'cyan' }
    }));

    const dot1 = document.querySelector('.pulse-dot-1');
    if (dot1) {
      gsap.set(dot1, { display: 'block', attr: { cx: '0%' } });
      gsap.to(dot1, { attr: { cx: '100%' }, duration: 0.4, ease: 'none' });
    }

    await triggerDelay(400);

    // Hide travel dot 1
    if (dot1) gsap.set(dot1, { display: 'none' });

    // STEP 2: Highlight Cache Check node (Yellow status: searching local disk folder)
    setPipelineState((prev) => ({
      ...prev,
      cache: { badge: 'Searching...', highlight: 'highlight-yellow' }
    }));
    
    gsap.fromTo('.cache-node-ref', 
      { scale: 0.95 }, 
      { scale: 1.05, duration: 0.2, yoyo: true, repeat: 1, ease: 'power1.out' }
    );

    try {
      // Trigger the real GET query request
      const response = await fetch(`/files/${encodeURIComponent(targetFilename)}`);
      
      // Extract custom headers exposed by backend CORS configuration
      const cacheHeader = response.headers.get('X-Cache');
      const latencyHeader = response.headers.get('X-Response-Time-MS');
      const latency = latencyHeader ? parseFloat(latencyHeader) : parseFloat((performance.now() - simulationStartTime).toFixed(2));

      // CASE A: CACHE HIT (File is found locally in CDN Cache)
      if (cacheHeader === 'HIT') {
        await triggerDelay(300);
        
        // Cache node highlights cyan to indicate a HIT
        setPipelineState((prev) => ({
          ...prev,
          cache: { badge: 'HIT', highlight: 'highlight-cyan' }
        }));
        
        gsap.fromTo('.cache-node-ref', 
          { scale: 1 }, 
          { scale: 1.1, duration: 0.3, yoyo: true, repeat: 1, ease: 'bounce.out' }
        );

        // Render preview context
        const fileExtension = targetFilename.split('.').pop().toLowerCase();
        const isImageFile = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension);

        if (isImageFile) {
          const fileBlob = await response.blob();
          const previewObjectUrl = URL.createObjectURL(fileBlob);
          setSimulationResult({
            cardClass: 'hit',
            statusBadge: 'CACHE HIT (CDN)',
            latency,
            filename: targetFilename,
            type: 'image',
            previewUrl: previewObjectUrl
          });
        } else {
          try {
            const rawText = await response.text();
            setSimulationResult({
              cardClass: 'hit',
              statusBadge: 'CACHE HIT (CDN)',
              latency,
              filename: targetFilename,
              type: 'text',
              content: rawText.substring(0, 1000)
            });
          } catch (e) {
            setSimulationResult({
              cardClass: 'hit',
              statusBadge: 'CACHE HIT (CDN)',
              latency,
              filename: targetFilename,
              type: 'binary'
            });
          }
        }
      } 
      
      // CASE B: BLOOM FILTER REJECTION (Bloom Filter confirms file does not exist, blocking the lookup)
      else if (cacheHeader === 'BLOOM_REJECT') {
        await triggerDelay(400);
        
        // Flow goes Cache (MISS) -> Bloom (BLOCKED - Red status). Animate pulse dot 2 in red.
        setPipelineState((prev) => ({
          ...prev,
          cache: { badge: 'MISS', highlight: '' },
          arrow2: { active: true, type: 'red' },
          bloom: { badge: 'BLOCKED', highlight: 'highlight-red' }
        }));

        const dot2 = document.querySelector('.pulse-dot-2');
        if (dot2) {
          gsap.set(dot2, { display: 'block', attr: { cx: '0%' } });
          gsap.to(dot2, { attr: { cx: '100%' }, duration: 0.4, ease: 'none' });
        }

        await triggerDelay(400);
        
        if (dot2) gsap.set(dot2, { display: 'none' });

        gsap.fromTo('.bloom-node-ref', 
          { scale: 0.95 }, 
          { scale: 1.08, duration: 0.25, yoyo: true, repeat: 1, ease: 'power1.out' }
        );

        setSimulationResult({
          cardClass: 'reject',
          statusBadge: 'BLOOM FILTER REJECT (BLOCKED)',
          latency,
          filename: targetFilename,
          type: 'reject_bloom'
        });
      } 
      
      // CASE C: CACHE MISS but Bloom Filter PASS (File queried and loaded from Origin)
      else if (cacheHeader === 'MISS') {
        await triggerDelay(450);
        
        // Flow goes Cache (MISS) -> Bloom (PASS - Green status)
        setPipelineState((prev) => ({
          ...prev,
          cache: { badge: 'MISS', highlight: '' },
          arrow2: { active: true, type: 'cyan' },
          bloom: { badge: 'PASS', highlight: 'highlight-green' }
        }));

        const dot2 = document.querySelector('.pulse-dot-2');
        if (dot2) {
          gsap.set(dot2, { display: 'block', attr: { cx: '0%' } });
          gsap.to(dot2, { attr: { cx: '100%' }, duration: 0.4, ease: 'none' });
        }

        await triggerDelay(400);
        
        if (dot2) gsap.set(dot2, { display: 'none' });

        gsap.fromTo('.bloom-node-ref', 
          { scale: 0.95 }, 
          { scale: 1.05, duration: 0.2, yoyo: true, repeat: 1, ease: 'power1.out' }
        );

        // Highlight Origin Node: file query returned matching database content
        setPipelineState((prev) => ({
          ...prev,
          arrow3: { active: true, type: 'yellow' },
          origin: { badge: 'FOUND', highlight: 'highlight-green' }
        }));

        const dot3 = document.querySelector('.pulse-dot-3');
        if (dot3) {
          gsap.set(dot3, { display: 'block', attr: { cx: '0%' } });
          gsap.to(dot3, { attr: { cx: '100%' }, duration: 0.4, ease: 'none' });
        }

        await triggerDelay(400);
        
        if (dot3) gsap.set(dot3, { display: 'none' });

        gsap.fromTo('.origin-node-ref', 
          { scale: 0.95 }, 
          { scale: 1.08, duration: 0.25, yoyo: true, repeat: 1, ease: 'power1.out' }
        );

        await triggerDelay(200);
        
        // Return stream cached in local CDN folder (flash Cache node green/cyan)
        setPipelineState((prev) => ({
          ...prev,
          cache: { badge: 'CACHED', highlight: 'highlight-cyan' }
        }));

        gsap.fromTo('.cache-node-ref', 
          { filter: 'brightness(1.5)' }, 
          { filter: 'brightness(1)', duration: 0.5, ease: 'power2.out' }
        );

        // Render preview context
        const fileExtension = targetFilename.split('.').pop().toLowerCase();
        const isImageFile = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension);

        if (isImageFile) {
          const fileBlob = await response.blob();
          const previewObjectUrl = URL.createObjectURL(fileBlob);
          setSimulationResult({
            cardClass: 'miss',
            statusBadge: 'CACHE MISS (ORIGIN FETCH)',
            latency,
            filename: targetFilename,
            type: 'image',
            previewUrl: previewObjectUrl
          });
        } else {
          try {
            const rawText = await response.text();
            setSimulationResult({
              cardClass: 'miss',
              statusBadge: 'CACHE MISS (ORIGIN FETCH)',
              latency,
              filename: targetFilename,
              type: 'text',
              content: rawText.substring(0, 1000)
            });
          } catch (e) {
            setSimulationResult({
              cardClass: 'miss',
              statusBadge: 'CACHE MISS (ORIGIN FETCH)',
              latency,
              filename: targetFilename,
              type: 'binary'
            });
          }
        }
      } 
      
      // CASE D: FALSE POSITIVE (Bloom Filter predicted yes, but origin database returned 404)
      else if (cacheHeader === 'MISS_FALSE_POSITIVE') {
        await triggerDelay(450);
        
        // Cache (MISS) -> Bloom (PASS - green) -> Origin (404 - red)
        setPipelineState((prev) => ({
          ...prev,
          cache: { badge: 'MISS', highlight: '' },
          arrow2: { active: true, type: 'cyan' },
          bloom: { badge: 'PASS', highlight: 'highlight-green' }
        }));

        const dot2 = document.querySelector('.pulse-dot-2');
        if (dot2) {
          gsap.set(dot2, { display: 'block', attr: { cx: '0%' } });
          gsap.to(dot2, { attr: { cx: '100%' }, duration: 0.4, ease: 'none' });
        }

        await triggerDelay(400);
        
        if (dot2) gsap.set(dot2, { display: 'none' });

        setPipelineState((prev) => ({
          ...prev,
          arrow3: { active: true, type: 'red' },
          origin: { badge: '404', highlight: 'highlight-red' }
        }));

        const dot3 = document.querySelector('.pulse-dot-3');
        if (dot3) {
          gsap.set(dot3, { display: 'block', attr: { cx: '0%', fill: 'var(--red)' } });
          gsap.to(dot3, { attr: { cx: '100%' }, duration: 0.4, ease: 'none' });
        }

        await triggerDelay(400);
        
        if (dot3) gsap.set(dot3, { display: 'none' });

        gsap.fromTo('.origin-node-ref', 
          { scale: 0.95 }, 
          { scale: 1.08, duration: 0.25, yoyo: true, repeat: 1, ease: 'power1.out' }
        );

        setSimulationResult({
          cardClass: 'reject',
          statusBadge: 'BLOOM FILTER FALSE POSITIVE (404)',
          latency,
          filename: targetFilename,
          type: 'reject_false_positive'
        });
      }

      await fetchSystemStats();
    } catch (err) {
      console.error(err);
      setSimulationResult({
        cardClass: 'reject',
        statusBadge: 'ERROR',
        latency: 0,
        filename: targetFilename,
        type: 'error',
        content: err.message
      });
    } finally {
      setIsSimulating(false);
    }
  };

  // Compile request logs and system notifications into a chronological array
  const combinedConsoleLogs = [
    ...systemActionLogs,
    ...backendRequestLogs.map((log) => ({ ...log, type: 'request' }))
  ];
  combinedConsoleLogs.sort((logA, logB) => new Date(logB.timestamp) - new Date(logA.timestamp));

  return (
    <div className="app-container">
      <div className="glow-container">
        <div className="glow-sphere glow-1"></div>
        <div className="glow-sphere glow-2"></div>
      </div>

      <Header cdnPort={5001} />

      <main className="dashboard-grid">
        <div className="panel sidebar" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <Metrics
            totalRequests={systemMetrics.totalRequests}
            cacheHits={systemMetrics.cacheHits}
            cacheMisses={systemMetrics.cacheMisses}
            bloomRejections={systemMetrics.bloomRejections}
            hitRate={systemMetrics.hitRate}
          />
          <CacheControls
            onFlushCache={handleFlushCache}
            onRebuildFilter={handleRebuildFilter}
            isLoading={isSimulating}
          />
        </div>

        <PipelineSimulator
          filename={filename}
          setFilename={setFilename}
          onSendRequest={handleSendRequest}
          pipelineState={pipelineState}
          result={simulationResult}
          isSimulating={isSimulating}
        />

        <InventoryTabs
          originFiles={originDatabaseFiles}
          cachedFiles={cachedCdnFiles}
          cacheSize={totalCacheSize}
          onFileClick={handleFileClick}
          onUpload={handleUploadFile}
          uploadStatus={uploadStatusMessage}
          uploadStatusType={uploadStatusType}
          isUploading={isUploadingInProgress}
        />
      </main>

      <ConsoleLogs logs={combinedConsoleLogs} />

      <ConceptFooter />
    </div>
  );
}
