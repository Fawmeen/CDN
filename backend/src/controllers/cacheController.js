import path from "path";
import axios from "axios";
import FormData from "form-data"; 
import env from "../config/env.js";
import * as cacheService from "../services/cacheService.js";
import { fetchFileFromOrigin } from "../services/originService.js";

/**
 * Cache Controller
 * Implements the core CDN caching proxy workflow and utility routes.
 */

/**
 * GET /files/:filename
 * Resolves request using Caching + Bloom Filter logic
 */
export const getFile = async (req, res) => {
    const start = performance.now();
    const filename = req.params.filename;

    if (!filename) {
        return res.status(400).json({ error: "Filename is required" });
    }

    // Security: Sanitize filename to prevent directory traversal
    const safeFilename = path.basename(filename);

    try {
        // 1. Check if the file is cached locally
        if (cacheService.isCached(safeFilename)) {
            const cached = cacheService.getCachedFile(safeFilename);
            if (cached) {
                const latency = parseFloat((performance.now() - start).toFixed(2));
                cacheService.logRequest(safeFilename, "HIT", latency);

                // Set headers to indicate CDN Cache Hit
                res.setHeader("X-Cache", "HIT");
                res.setHeader("X-Response-Time-MS", latency);
                // Guess content type from filename extension
                const ext = path.extname(safeFilename).toLowerCase();
                const mimeTypes = {
                    ".jpg": "image/jpeg",
                    ".jpeg": "image/jpeg",
                    ".png": "image/png",
                    ".gif": "image/gif",
                    ".txt": "text/plain",
                    ".html": "text/html",
                    ".css": "text/css",
                    ".js": "application/javascript",
                    ".json": "application/json"
                };
                res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
                return res.send(cached.data);
            }
        }

        // 2. Cache Miss: Query the Bloom Filter to see if file is on the origin
        const probablyExists = cacheService.checkBloomFilter(safeFilename);

        if (!probablyExists) {
            // Bloom Filter returned false -> file is definitely not on the origin!
            // We reject the request instantly, avoiding a costly HTTP request to the origin.
            const latency = parseFloat((performance.now() - start).toFixed(2));
            cacheService.logRequest(safeFilename, "BLOOM_REJECT", latency);

            res.setHeader("X-Cache", "BLOOM_REJECT");
            res.setHeader("X-Response-Time-MS", latency);
            return res.status(404).json({
                error: "File definitely does not exist (Bloom Filter rejection)",
                filename: safeFilename,
                status: "BLOOM_REJECT",
                latencyMs: latency
            });
        }

        // 3. Bloom Filter says yes -> Query the Origin Server
        console.log(`Bloom filter matched (Probably Yes). Querying origin for ${safeFilename}...`);
        const originFile = await fetchFileFromOrigin(safeFilename);

        if (originFile) {
            // File exists on Origin -> Cache it locally and serve it
            cacheService.saveCachedFile(safeFilename, originFile.data);

            const latency = parseFloat((performance.now() - start).toFixed(2));
            cacheService.logRequest(safeFilename, "MISS", latency);

            res.setHeader("X-Cache", "MISS");
            res.setHeader("X-Response-Time-MS", latency);
            res.setHeader("Content-Type", originFile.contentType);
            return res.send(originFile.data);
        } else {
            // False Positive: Bloom Filter said yes, but file was not actually on origin.
            // This is standard Bloom Filter behavior (probabilistic nature).
            const latency = parseFloat((performance.now() - start).toFixed(2));
            cacheService.logRequest(safeFilename, "MISS", latency);

            res.setHeader("X-Cache", "MISS_FALSE_POSITIVE");
            res.setHeader("X-Response-Time-MS", latency);
            return res.status(404).json({
                error: "File not found on origin server (Bloom Filter False Positive)",
                filename: safeFilename,
                status: "MISS",
                latencyMs: latency
            });
        }

    } catch (err) {
        console.error("Error processing file request:", err);
        const latency = parseFloat((performance.now() - start).toFixed(2));
        res.status(500).json({
            error: "Internal CDN server error",
            message: err.message,
            latencyMs: latency
        });
    }
};

/**
 * GET /api/stats
 * Retrieves metrics from the cache service
 */
export const getStats = (req, res) => {
    res.json(cacheService.getCacheStats());
};

/**
 * POST /api/clear-cache
 * Flushes the local cache directory
 */
export const clearCache = (req, res) => {
    try {
        cacheService.flushCache();
        res.json({ message: "Edge Cache cleared successfully" });
    } catch (err) {
        res.status(500).json({ error: "Failed to clear cache", message: err.message });
    }
};

/**
 * POST /api/upload
 * Gateway to upload a file to the origin server, and update the local Bloom Filter.
 */
export const uploadFileToOrigin = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        // Forward the file upload to the origin server (port 9000) using FormData
        const form = new FormData();
        form.append("file", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        const response = await axios.post(`${env.ORIGIN_URL}/api/upload`, form, {
            headers: {
                ...form.getHeaders()
            }
        });

        // If upload is successful, update the Edge Cache's Bloom Filter
        const uploadedFilename = response.data.filename;
        cacheService.registerNewFile(uploadedFilename);

        res.json({
            message: "File successfully uploaded to Origin and registered in CDN Bloom Filter!",
            filename: uploadedFilename,
            originResponse: response.data
        });
    } catch (err) {
        console.error("Error forwarding file upload to origin:", err.message);
        res.status(500).json({
            error: "Failed to upload file to origin server",
            message: err.message
        });
    }
};

/**
 * GET /api/origin-files
 * Fetch list of files currently on origin server
 */
export const getOriginFiles = async (req, res) => {
    try {
        const response = await axios.get(`${env.ORIGIN_URL}/api/files`);
        res.json(response.data);
    } catch (err) {
        res.status(500).json({
            error: "Failed to retrieve file list from origin server",
            message: err.message
        });
    }
};

/**
 * POST /api/rebuild-filter
 * Re-fetches the origin file inventory and rebuilds the bloom filter
 */
export const rebuildFilter = async (req, res) => {
    try {
        await cacheService.initializeBloomFilter();
        res.json({ message: "Bloom filter successfully rebuilt from origin inventory" });
    } catch (err) {
        res.status(500).json({ error: "Failed to rebuild bloom filter", message: err.message });
    }
};
