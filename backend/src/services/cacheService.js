import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import BloomFilter from "../utils/bloomFilter.js";
import { fetchFilesList } from "./originService.js";
import * as fileUtils from "../utils/fileUtils.js";
import env from "../config/env.js";

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

// Target cache folder path: backend/cache
const CACHE_DIR = path.resolve(_dirname, "../../cache");

// Initialize a Bloom Filter (e.g., m = 1000, k = 4)
const bloomFilter = new BloomFilter(1000, 4);

// Metrics tracker for the application
export const metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    bloomRejections: 0,
    logs: [] // Historic request logs: { timestamp, filename, status, latency }
};

/**
 * Log an event to the metrics log
 */
export const logRequest = (filename, status, latency) => {
    metrics.totalRequests++;
    if (status === "HIT") metrics.cacheHits++;
    else if (status === "MISS") metrics.cacheMisses++;
    else if (status === "BLOOM_REJECT") metrics.bloomRejections++;

    metrics.logs.unshift({
        timestamp: new Date().toISOString(),
        filename,
        status,
        latency
    });

    // Limit log history to last 50 entries
    if (metrics.logs.length > 50) {
        metrics.logs.pop();
    }
};

/**
 * Initializes the Bloom Filter by querying the origin server's file list.
 */
export const initializeBloomFilter = async () => {
    console.log("Initializing Bloom Filter from Origin...");
    
    // Ensure cache directory exists at startup
    fileUtils.ensureDirExists(CACHE_DIR);

    // Fetch existing files from origin
    const files = await fetchFilesList();
    
    // Clear and populate Bloom Filter
    bloomFilter.clear();
    for (const filename of files) {
        console.log(`Adding to Bloom Filter: ${filename}`);
        bloomFilter.add(filename);
    }
    
    console.log(`Bloom Filter initialized with ${files.length} origin files.`);
};

/**
 * Checks if a file exists in the local cache.
 * @param {string} filename 
 * @returns {boolean}
 */
export const isCached = (filename) => {
    // Sanitize filename to avoid path traversal vulnerabilities
    const safeFilename = path.basename(filename);
    const filepath = path.join(CACHE_DIR, safeFilename);
    return fs.existsSync(filepath);
};

/**
 * Reads a cached file.
 * Updates its modification (mtime) and access (atime) times on every hit to enable Least Recently Used (LRU) tracking.
 * @param {string} filename 
 * @returns {{ data: Buffer, filepath: string } | null}
 */
export const getCachedFile = (filename) => {
    const safeFilename = path.basename(filename);
    const filepath = path.join(CACHE_DIR, safeFilename);
    if (fs.existsSync(filepath)) {
        // Touch file times: updates both access time (atime) and modify time (mtime) to now
        const now = new Date();
        try {
            fs.utimesSync(filepath, now, now);
        } catch (err) {
            console.error(`Failed to update access/touch times for cached file ${safeFilename}:`, err.message);
        }
        const data = fileUtils.readFile(filepath);
        return data ? { data, filepath } : null;
    }
    return null;
};

/**
 * Saves a file to the cache directory.
 * Automatically runs cache checks to enforce eviction policies.
 * @param {string} filename 
 * @param {Buffer} buffer 
 */
export const saveCachedFile = (filename, buffer) => {
    const safeFilename = path.basename(filename);
    const filepath = path.join(CACHE_DIR, safeFilename);
    fileUtils.saveFile(filepath, buffer);

    // Enforce cache policies immediately after saving
    enforceCachePolicies();
};

/**
 * Uses the Bloom Filter to check if a file probably exists on the origin.
 * @param {string} filename 
 * @returns {boolean} false if definitely not on origin, true if probably on origin
 */
export const checkBloomFilter = (filename) => {
    const safeFilename = path.basename(filename);
    return bloomFilter.contains(safeFilename);
};

/**
 * Manually add a file name to the Bloom Filter (e.g. when a file is uploaded).
 * @param {string} filename 
 */
export const registerNewFile = (filename) => {
    const safeFilename = path.basename(filename);
    bloomFilter.add(safeFilename);
    console.log(`Registered new file in Bloom Filter: ${safeFilename}`);
};

/**
 * Wipes out the local cache directory.
 */
export const flushCache = () => {
    fileUtils.clearDirectory(CACHE_DIR);
    console.log("Local cache directory flushed.");
};

/**
 * Retrieves cache metrics (size, file count, hit rate, and filter stats).
 * @returns {object} Cache stats
 */
export const getCacheStats = () => {
    const dirStats = fileUtils.getDirectoryStats(CACHE_DIR);
    
    // Calculate hit rate
    const hitRate = metrics.totalRequests > 0 
        ? ((metrics.cacheHits / metrics.totalRequests) * 100).toFixed(1)
        : 0;

    return {
        cacheSizeKB: (dirStats.size / 1024).toFixed(2),
        cachedFilesCount: dirStats.count,
        cachedFilesList: dirStats.files,
        metrics: {
            totalRequests: metrics.totalRequests,
            cacheHits: metrics.cacheHits,
            cacheMisses: metrics.cacheMisses,
            bloomRejections: metrics.bloomRejections,
            hitRate: `${hitRate}%`
        },
        logs: metrics.logs
    };
};

/**
 * Periodically scans the cache folder and deletes expired or LRU files.
 */
export const enforceCachePolicies = () => {
    try {
        const dirStats = fileUtils.getDirectoryStats(CACHE_DIR);
        const filesList = dirStats.files; // Array of { name, size, mtime }
        if (filesList.length === 0) return;

        const now = new Date();
        
        // Load TTL and size limit from env configs, fallback if undefined
        const cacheTtlMs = (parseInt(env.CACHE_TTL_SEC, 10) || 300) * 1000;
        const cacheMaxSizeBytes = (parseInt(env.CACHE_MAX_SIZE_MB, 10) || 10) * 1024 * 1024;

        let totalCurrentSize = 0;
        const activeFiles = [];

        // 1. Enforce TTL: Delete files that haven't been touched in TTL seconds
        for (const file of filesList) {
            const filepath = path.join(CACHE_DIR, file.name);
            const ageMs = now - new Date(file.mtime);

            if (ageMs > cacheTtlMs) {
                console.log(`[Cache TTL Eviction] Deleting expired file "${file.name}" (Age: ${(ageMs / 1000).toFixed(1)}s)`);
                try {
                    fs.unlinkSync(filepath);
                } catch (err) {
                    console.error(`Failed to delete expired file ${file.name}:`, err.message);
                }
            } else {
                totalCurrentSize += file.size;
                activeFiles.push(file);
            }
        }

        // 2. Enforce LRU: Evict oldest accessed files if size limit is exceeded
        if (totalCurrentSize > cacheMaxSizeBytes) {
            console.log(`[Cache LRU Eviction] Cache size (${(totalCurrentSize / 1024).toFixed(1)} KB) exceeds limit (${(cacheMaxSizeBytes / 1024).toFixed(1)} KB). Evicting files...`);
            
            // Sort by modified/touch time ascending (oldest first)
            activeFiles.sort((a, b) => new Date(a.mtime) - new Date(b.mtime));

            for (const file of activeFiles) {
                if (totalCurrentSize <= cacheMaxSizeBytes) break;

                const filepath = path.join(CACHE_DIR, file.name);
                console.log(`[Cache LRU Eviction] Evicting least recently used file "${file.name}" (${(file.size / 1024).toFixed(1)} KB)`);
                try {
                    fs.unlinkSync(filepath);
                    totalCurrentSize -= file.size;
                } catch (err) {
                    console.error(`Failed to evict file ${file.name}:`, err.message);
                }
            }
        }
    } catch (err) {
        console.error("Error executing cache policies enforcement:", err.message);
    }
};

// Background Cache Eviction thread: check every 10 seconds
setInterval(enforceCachePolicies, 10000);
