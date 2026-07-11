import React, { useState, useRef } from 'react';

export default function InventoryTabs({
  originFiles = [],
  cachedFiles = [],
  cacheSize = "0.00 KB",
  onFileClick,
  onUpload,
  uploadStatus = "",
  uploadStatusType = "",
  isUploading = false
}) {
  const [activeTab, setActiveTab] = useState('tab-origin');
  const [selectedFile, setSelectedFile] = useState(null);
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleCancelFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedFile) return;
    
    const success = await onUpload(selectedFile);
    if (success) {
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  return (
    <section className="panel right-bar">
      {/* Tabs */}
      <div className="tabs-header">
        <button
          className={`tab-btn ${activeTab === 'tab-origin' ? 'active' : ''}`}
          onClick={() => setActiveTab('tab-origin')}
        >
          Origin Inventory
        </button>
        <button
          className={`tab-btn ${activeTab === 'tab-cache' ? 'active' : ''}`}
          onClick={() => setActiveTab('tab-cache')}
        >
          Edge Cache Files
        </button>
        <button
          className={`tab-btn ${activeTab === 'tab-upload' ? 'active' : ''}`}
          onClick={() => setActiveTab('tab-upload')}
        >
          Upload Asset
        </button>
      </div>

      {/* Tab Content: Origin Inventory */}
      {activeTab === 'tab-origin' && (
        <div className="tab-content active" id="tab-origin">
          <div className="inventory-header">
            <span>Database Files (Source of Truth)</span>
          </div>
          <ul className="file-list" id="origin-file-list">
            {originFiles.length === 0 ? (
              <li className="empty-msg">No files on Origin server.</li>
            ) : (
              originFiles.map((file) => (
                <li key={file.name} onClick={() => onFileClick(file.name)}>
                  <span>{file.name}</span>
                  <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {/* Tab Content: Cache Inventory */}
      {activeTab === 'tab-cache' && (
        <div className="tab-content active" id="tab-cache">
          <div className="inventory-header">
            <span>Cached Files on CDN Edge</span>
            <span className="badge" id="cache-size-badge">
              {cacheSize}
            </span>
          </div>
          <ul className="file-list" id="cache-file-list">
            {cachedFiles.length === 0 ? (
              <li className="empty-msg">No files currently cached on Edge.</li>
            ) : (
              cachedFiles.map((file) => (
                <li key={file.name} onClick={() => onFileClick(file.name)}>
                  <span>{file.name}</span>
                  <span className="file-size">{(file.size / 1024).toFixed(1)} KB</span>
                </li>
              ))
            )}
          </ul>
        </div>
      )}

      {/* Tab Content: Upload */}
      {activeTab === 'tab-upload' && (
        <div className="tab-content active" id="tab-upload">
          <div className="upload-area">
            <h3>Add Asset to Origin Storage</h3>
            <p className="subtitle">
              Upload files to the Origin Database. Upon upload, they will register in the Bloom Filter dynamically.
            </p>
            <form id="upload-form" onSubmit={handleSubmit}>
              <label htmlFor="file-upload-input" className="upload-dropzone">
                <span className="upload-icon">📤</span>
                <span className="upload-text">Select file to upload</span>
                <span className="upload-subtext">Images, text, or configs (Max 10MB)</span>
                <input
                  type="file"
                  id="file-upload-input"
                  name="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  required
                />
              </label>
              
              {selectedFile && (
                <div className="file-selected-info" id="file-info-bar">
                  <span id="selected-file-name">{selectedFile.name}</span>
                  <button type="button" id="btn-cancel-file" onClick={handleCancelFile}>
                    ✕
                  </button>
                </div>
              )}

              <button 
                type="submit" 
                className="btn btn-primary btn-block"
                disabled={!selectedFile || isUploading}
              >
                {isUploading ? 'Uploading...' : 'Upload to Origin'}
              </button>
            </form>
            {uploadStatus && (
              <div className={`upload-status-msg ${uploadStatusType}`}>
                {uploadStatus}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
