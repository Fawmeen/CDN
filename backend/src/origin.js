import express from "express";
import path from "path";
import multer from "multer";
import env from "./config/env.js";
import { getDbPool, initializeDatabase } from "./config/db.js";

const originExpressApp = express();

// Multer middleware: configured to store uploaded file buffers in memory (RAM) 
// instead of writing temp files to disk, allowing fast transfers directly to MySQL.
const memoryStorage = multer.memoryStorage();
const uploadMiddleware = multer({ 
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 } // Enforce a 10MB maximum file size limit
});

// Configure JSON body parser middleware
originExpressApp.use(express.json());

// Set up CORS headers allowing cross-origin requests from the React client on port 5173
originExpressApp.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

/**
 * GET /api/files
 * Retrieves the metadata details of all assets stored in the MySQL database.
 * Used by the CDN on startup to load keys into the Bloom Filter.
 */
originExpressApp.get("/api/files", async (req, res) => {
    try {
        const dbConnectionPool = getDbPool();
        
        // Query only filename, size, and modified timestamp (uploaded_at) to avoid pulling heavy binary content
        const [fileRows] = await dbConnectionPool.query(
            "SELECT name, size, uploaded_at as mtime FROM origin_files ORDER BY uploaded_at DESC"
        );

        res.json({
            files: fileRows.map(row => row.name),
            details: fileRows.map(row => ({
                name: row.name,
                size: row.size,
                mtime: row.mtime
            }))
        });
    } catch (err) {
        console.error("Error retrieving files list from database:", err);
        res.status(500).json({ error: "Failed to list files on origin server" });
    }
});

/**
 * POST /api/upload
 * Endpoint to upload a new asset directly into the database.
 * The file is registered as a row containing name, size, binary content, and MIME type.
 */
originExpressApp.post("/api/upload", uploadMiddleware.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file was selected for upload" });
    }

    // Sanitize the original filename to prevent directory traversal or malicious injection
    const safeFilename = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9.\-_]/g, "");

    try {
        const dbConnectionPool = getDbPool();
        
        // Save the file parameters and raw buffer directly into the database
        // If a file with the same name already exists, overwrite it (upsert)
        await dbConnectionPool.query(
            `INSERT INTO origin_files (name, size, content, mime_type) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE size = VALUES(size), content = VALUES(content), mime_type = VALUES(mime_type)`,
            [safeFilename, req.file.size, req.file.buffer, req.file.mimetype]
        );

        console.log(`Origin Server: Successfully uploaded and saved to MySQL: ${safeFilename} (${req.file.size} bytes)`);
        
        res.json({
            message: "File successfully saved in origin database",
            filename: safeFilename,
            size: req.file.size
        });
    } catch (err) {
        console.error("Error inserting file binary into database:", err);
        res.status(500).json({ error: "Failed to save file on database", message: err.message });
    }
});

/**
 * GET /:filename
 * Serves a file's binary stream directly out of the MySQL database.
 * Queried by the CDN Cache server on cache misses.
 */
originExpressApp.get("/:filename", async (req, res) => {
    const requestedFilename = req.params.filename;
    if (!requestedFilename) {
        return res.status(400).json({ error: "Filename parameter is required" });
    }

    const safeFilename = path.basename(requestedFilename);

    try {
        const dbConnectionPool = getDbPool();
        
        // Retrieve the MIME type and content buffer for the requested file
        const [fileRecordRows] = await dbConnectionPool.query(
            "SELECT content, mime_type FROM origin_files WHERE name = ?", 
            [safeFilename]
        );

        // If no rows match, the file does not exist in the database
        if (fileRecordRows.length === 0) {
            console.warn(`Origin Server Database: Requested file "${safeFilename}" not found.`);
            return res.status(404).send("File not found");
        }

        const matchedFileRecord = fileRecordRows[0];
        
        // Stream the binary buffer back to the CDN with its corresponding Content-Type
        res.setHeader("Content-Type", matchedFileRecord.mime_type || "application/octet-stream");
        return res.send(matchedFileRecord.content);
    } catch (err) {
        console.error(`Error serving file "${safeFilename}" from database:`, err);
        res.status(500).json({ error: "Failed to fetch file from origin database" });
    }
});

// Main startup function for the origin application server
const startOriginServer = async () => {
    try {
        // Run database existence check and compile table schemas
        await initializeDatabase();

        originExpressApp.listen(env.ORIGIN_PORT, () => {
            console.log(`==================================================`);
            console.log(`Origin Database Server is running on port ${env.ORIGIN_PORT}`);
            console.log(`==================================================`);
        });
    } catch (err) {
        console.error("Critical Failure: Failed to boot Origin server:", err);
        process.exit(1);
    }
};

startOriginServer();