/**
 * FILE EXPLANATION:
 * This controller contains the logic for Express route endpoints on the Edge Cache CDN server.
 * Its core function is proxying queries:
 *   1. Intercepts file requests.
 *   2. Serves them from disk if cached (Cache HIT).
 *   3. If not cached, runs a Bloom Filter check to block nonexistent requests (BLOOM_REJECT).
 *   4. Forwards genuine cache misses to the Origin server, saves a copy locally, and serves it (Cache MISS).
 */

// KEYWORDS EXPLANATION:
// - "req" (Request): Express object containing details about the incoming client request (parameters, headers, file payloads).
// - "res" (Response): Express object used to send back HTTP status codes (200, 404, 500) and response bodies.
// - "res.setHeader()": Adds a HTTP header to the response so browsers/clients can read metadata (e.g. Cache status, latency, content MIME types).
// - "res.send()": Transmits raw data (like file buffers) back to the client.
// - "performance.now()": High-resolution timer in Node.js used to calculate microsecond-accurate operation speeds.
// - "FormData": A JavaScript class mimicking HTML form multi-part data, used to send files over HTTP APIs.
// - "axios.post()": Sends HTTP POST requests containing file payload formats.

import path from "path";
import axios from "axios";
import FormData from "form-data"; 
import env from "../config/env.js";
import * as cacheService from "../services/cacheService.js";
import { fetchFileFromOrigin } from "../services/originService.js";

/**
 * getFile(req, res)
 * GET /:filename
 * The core CDN caching and guard pipeline handler.
 */
export const getFile = async (req, res) => {
    const start = performance.now(); // High-resolution timer start
    const filename = req.params.filename;

    if (!filename) {
        return res.status(400).json({ error: "Filename is required" });
    }

    // Security: path.basename removes directory traversal paths (e.g., ../../../etc/passwd -> passwd)
    const safeFilename = path.basename(filename);

    try {
        // 1. Check if the file already exists in our local cache folder
        if (cacheService.isCached(safeFilename)) {
            const cached = cacheService.getCachedFile(safeFilename);
            if (cached) {
                const latency = parseFloat((performance.now() - start).toFixed(2));
                cacheService.logRequest(safeFilename, "HIT", latency);

                // Set headers so client knows it was a CDN Cache Hit
                res.setHeader("X-Cache", "HIT");
                res.setHeader("X-Response-Time-MS", latency);
                
                // Guess content type from filename extension so the browser renders it correctly
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
                    ".json": "application/json",
                    ".pdf": "application/pdf"
                };
                res.setHeader("Content-Type", mimeTypes[ext] || "application/octet-stream");
                return res.send(cached.data); // Return file data
            }
        }

        // 2. Cache MISS: Query the Bloom Filter to see if file actually exists on origin
        const probablyExists = cacheService.checkBloomFilter(safeFilename);

        if (!probablyExists) {
            // Bloom Filter returned false -> file definitely does NOT exist on the origin server.
            // We reject it instantly, completely avoiding an unnecessary network round-trip to the origin.
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

        // 3. Bloom Filter returned true -> Query the Origin Server
        console.log(`Bloom filter matched (Probably Yes). Querying origin for ${safeFilename}...`);
        const originFile = await fetchFileFromOrigin(safeFilename);

        if (originFile) {
            // File was found on Origin -> Save it locally to disk cache and serve it
            cacheService.saveCachedFile(safeFilename, originFile.data);

            const latency = parseFloat((performance.now() - start).toFixed(2));
            cacheService.logRequest(safeFilename, "MISS", latency);

            res.setHeader("X-Cache", "MISS");
            res.setHeader("X-Response-Time-MS", latency);
            res.setHeader("Content-Type", originFile.contentType);
            return res.send(originFile.data);
        } else {
            // False Positive: Bloom Filter said yes, but file wasn't actually on origin.
            // This is expected probabilistic behavior in Bloom Filters.
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
 * getStats(req, res)
 * GET /api/stats
 * Returns cache metrics and logging data to the client dashboard.
 */
export const getStats = (req, res) => {
    res.json(cacheService.getCacheStats());
};

/**
 * clearCache(req, res)
 * POST /api/clear-cache
 * Flushes all files saved inside the CDN local disk folder.
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
 * uploadFileToOrigin(req, res)
 * POST /api/upload
 * Forwards client file upload directly to the origin server, then registers
 * it dynamically inside the Edge Cache's Bloom Filter.
 */
export const uploadFileToOrigin = async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file uploaded" });
    }

    try {
        // Forward file stream/buffer to the origin server using multipart FormData
        const form = new FormData();
        form.append("file", req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype
        });

        // Send POST request containing file payload to the origin server
        const response = await axios.post(`${env.ORIGIN_URL}/api/upload`, form, {
            headers: {
                ...form.getHeaders() // Inject multipart form headers
            }
        });

        // Insert new filename to local Bloom Filter so subsequent requests bypass rejection
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
 * getOriginFiles(req, res)
 * GET /api/origin-files
 * Retrieves list of files registered inside the origin database.
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
 * rebuildFilter(req, res)
 * POST /api/rebuild-filter
 * Re-reads files list from origin to completely rebuild the Bloom Filter.
 */
export const rebuildFilter = async (req, res) => {
    try {
        await cacheService.initializeBloomFilter();
        res.json({ message: "Bloom filter successfully rebuilt from origin inventory" });
    } catch (err) {
        res.status(500).json({ error: "Failed to rebuild bloom filter", message: err.message });
    }
};
