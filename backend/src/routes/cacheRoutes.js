/**
 * FILE EXPLANATION:
 * This file defines the Express router paths for the Edge Cache CDN server.
 * It mounts controller handlers to specific HTTP methods (GET, POST) and paths.
 * It also configures file upload middleware (`multer`) to intercept multipart file streams.
 */

// KEYWORDS EXPLANATION:
// - "express.Router()": A class to create modular, mountable route handlers. It behaves like a mini-app.
// - "multer": Node.js middleware for handling multipart/form-data (primarily used for uploading files).
// - "multer.memoryStorage()": Stores uploaded file data in RAM as a Buffer, rather than writing temporary files to disk.
// - "router.get()" / "router.post()": Registers routes for HTTP GET and POST requests respectively.
// - "export default": Standard ES6 export format to share the router instance.

import express from "express";
import multer from "multer";
import { 
    getFile, 
    getStats, 
    clearCache, 
    uploadFileToOrigin, 
    getOriginFiles, 
    rebuildFilter 
} from "../controllers/cacheController.js";

const router = express.Router();

// Configure multer file upload middleware with:
// - memory storage (faster transfers, zero temp disk cleanup)
// - 10MB file size limit threshold
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * HTTP GET /:filename
 * Resolves request using Caching + Bloom Filter logic
 */
router.get("/:filename", getFile);

/**
 * Administrative endpoints
 * GET /api/stats: Fetches cache size, count, metrics logs.
 * POST /api/clear-cache: Wipes local caching directory.
 * GET /api/origin-files: Fetches files database list.
 * POST /api/rebuild-filter: Populates the Bloom Filter fresh from origin.
 */
router.get("/api/stats", getStats);
router.post("/api/clear-cache", clearCache);
router.get("/api/origin-files", getOriginFiles);
router.post("/api/rebuild-filter", rebuildFilter);

/**
 * HTTP POST /api/upload
 * Intercepts file upload, forwards it to the origin, and registers it in the Bloom Filter.
 * - "upload.single('file')": Middleware parsing a single form field named "file".
 */
router.post("/api/upload", upload.single("file"), uploadFileToOrigin);

export default router;
