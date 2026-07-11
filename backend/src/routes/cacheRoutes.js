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

// Memory storage for forwarding files to the origin without local disk overhead
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// CDN Cache-Serving route
router.get("/:filename", getFile);

// Stats & Admin Operations
router.get("/api/stats", getStats);
router.post("/api/clear-cache", clearCache);
router.get("/api/origin-files", getOriginFiles);
router.post("/api/rebuild-filter", rebuildFilter);

// Upload gateway to upload files to Origin and update Bloom Filter
router.post("/api/upload", upload.single("file"), uploadFileToOrigin);

export default router;
