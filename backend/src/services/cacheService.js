/**
 * FILE EXPLANATION:
 * This file coordinates caching workflows, tracking request statistics (HIT, MISS, BLOOM_REJECT),
 * saving/reading files from local disk, and implementing cache cleanups.
 * It enforces two caching policies:
 *   1. Time-to-Live (TTL): Evicts files older than a threshold.
 *   2. Least Recently Used (LRU): Evicts files accessed longest ago if the storage folder exceeds size limits.
 */

// KEYWORDS EXPLANATION:
// - "export const": Standard ES Modules export syntax, allowing multiple exports in a single file.
// - "setInterval()": Node.js function scheduling a callback function to run repeatedly at fixed millisecond delays.
// - "fs.utimesSync()": Updates the file's access time (atime) and modification time (mtime). We touch these dates to track file access history.
// - "fs.unlinkSync()": Synchronously deletes a file.
// - "Array.prototype.sort()": Standard array sort. We compare date values to order files oldest-first.
// - "path.resolve()": Combines path segments into an absolute path.

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

// Initialize the Bloom Filter singleton (e.g., bit array of 1000, 4 hash functions)
const bloomFilter = new BloomFilter(1000, 4);

// Metrics tracker holding real-time statistics
export const metrics = {
    totalRequests: 0,
    cacheHits: 0,
    cacheMisses: 0,
    bloomRejections: 0,
    logs: [] // Holds last 50 request descriptors: { timestamp, filename, status, latency }
};

/**
 * logRequest(filename, status, latency)
 * Logs a request event and increments the matching metric counter.
 * @param {string} filename 
 * @param {string} status - "HIT", "MISS", "BLOOM_REJECT"
 * @param {number} latency - duration in ms
 */
export const logRequest = (filename, status, latency) => {
    metrics.totalRequests++;
    if (status === "HIT") metrics.cacheHits++;
    else if (status === "MISS") metrics.cacheMisses++;
    else if (status === "BLOOM_REJECT") metrics.bloomRejections++;

    // Add request record to the start of log history
    metrics.logs.unshift({
        timestamp: new Date().toISOString(),
        filename,
        status,
        latency
    });

    // Enforce history size cap (keep only the 50 most recent logs)
    if (metrics.logs.length > 50) {
        metrics.logs.pop();
    }
};

/**
 * initializeBloomFilter()
 * Fetches all filenames from the origin server to initialize the Bloom Filter.
 */
export const initializeBloomFilter = async () => {
    console.log("Initializing Bloom Filter from Origin...");
    
    // Create cache directory if it doesn't exist
    fileUtils.ensureDirExists(CACHE_DIR);

    // Fetch the list of file names
    const files = await fetchFilesList();
    
    // Empty the Bloom Filter and load the retrieved files
    bloomFilter.clear();
    for (const filename of files) {
        console.log(`Adding to Bloom Filter: ${filename}`);
        bloomFilter.add(filename);
    }
    
    console.log(`Bloom Filter initialized with ${files.length} origin files.`);
};

/**
 * isCached(filename)
 * Verifies if the file exists on the local caching disk.
 * @param {string} filename 
 * @returns {boolean}
 */
export const isCached = (filename) => {
    const safeFilename = path.basename(filename);
    const filepath = path.join(CACHE_DIR, safeFilename);
    return fs.existsSync(filepath);
};

/**
 * getCachedFile(filename)
 * Reads the cached file and updates its modified date (touching it)
 * to indicate a fresh access, which prevents it from being evicted by LRU.
 * @param {string} filename 
 * @returns {{ data: Buffer, filepath: string } | null}
 */
export const getCachedFile = (filename) => {
    const safeFilename = path.basename(filename);
    const filepath = path.join(CACHE_DIR, safeFilename);
    if (fs.existsSync(filepath)) {
        // Touch file times: updates access time (atime) and modify time (mtime) to now
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
 * saveCachedFile(filename, buffer)
 * Saves a file buffer locally and runs the eviction sweep.
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
 * checkBloomFilter(filename)
 * Tests if the filename exists in the Bloom Filter.
 * @param {string} filename 
 * @returns {boolean} false if definitely not present, true if probably present
 */
export const checkBloomFilter = (filename) => {
    const safeFilename = path.basename(filename);
    return bloomFilter.contains(safeFilename);
};

/**
 * registerNewFile(filename)
 * Inserts a filename into the Bloom Filter dynamically (called on fresh uploads).
 * @param {string} filename 
 */
export const registerNewFile = (filename) => {
    const safeFilename = path.basename(filename);
    bloomFilter.add(safeFilename);
    console.log(`Registered new file in Bloom Filter: ${safeFilename}`);
};

/**
 * flushCache()
 * Clears the local disk cache folder entirely.
 */
export const flushCache = () => {
    fileUtils.clearDirectory(CACHE_DIR);
    console.log("Local cache directory flushed.");
};

/**
 * getCacheStats()
 * Prepares system metrics and history logs to display on the dashboard UI.
 */
export const getCacheStats = () => {
    const dirStats = fileUtils.getDirectoryStats(CACHE_DIR);
    
    // Calculate percentage cache hit rate
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
 * enforceCachePolicies()
 * Triggered periodically. It scans all cached files and:
 *   1. Deletes expired files (older than CACHE_TTL_SEC).
 *   2. If total size exceeds CACHE_MAX_SIZE_MB, sorts active files by 
 *      touch date (oldest first) and evicts files until size is within threshold (LRU).
 */
export const enforceCachePolicies = () => {
    try {
        const dirStats = fileUtils.getDirectoryStats(CACHE_DIR);
        const filesList = dirStats.files; // Array of { name, size, mtime }
        if (filesList.length === 0) return;

        const now = new Date();
        
        // Load configurations with safety fallbacks
        const cacheTtlMs = (parseInt(env.CACHE_TTL_SEC, 10) || 300) * 1000;
        const cacheMaxSizeBytes = (parseInt(env.CACHE_MAX_SIZE_MB, 10) || 10) * 1024 * 1024;

        let totalCurrentSize = 0;
        const activeFiles = [];

        // 1. Evict based on Time-To-Live (TTL)
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
                activeFiles.push(file); // File is active
            }
        }

        // 2. Evict based on Least Recently Used (LRU)
        if (totalCurrentSize > cacheMaxSizeBytes) {
            console.log(`[Cache LRU Eviction] Cache size (${(totalCurrentSize / 1024).toFixed(1)} KB) exceeds limit (${(cacheMaxSizeBytes / 1024).toFixed(1)} KB). Evicting...`);
            
            // Sort active files oldest-first by comparing modification/touch times
            activeFiles.sort((a, b) => new Date(a.mtime) - new Date(b.mtime));

            for (const file of activeFiles) {
                if (totalCurrentSize <= cacheMaxSizeBytes) break; // Size is within threshold

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

// Start a background thread running the cache policy check loop every 10 seconds
setInterval(enforceCachePolicies, 10000);
