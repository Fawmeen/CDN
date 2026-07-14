/**
 * FILE EXPLANATION:
 * This file bootstraps and runs the Origin Server (default port 9000).
 * The Origin Server is the absolute source of truth for assets in this microservices setup.
 * It provides APIs to:
 *   - List all files stored in the database.
 *   - Upload new files directly into MySQL (as raw binary data).
 *   - Fetch and download files by name (queried on CDN cache misses).
 */

// KEYWORDS EXPLANATION:
// - "multer.memoryStorage()": Instructs Multer to store uploaded file buffers in memory (RAM)
//   as Buffer objects rather than writing temporary files to the disk. This speeds up transfer to MySQL.
// - "ON DUPLICATE KEY UPDATE": SQL upsert syntax. If a record with a unique key (filename) already exists,
//   it updates the existing record details instead of throwing an error.
// - "LONGBLOB": MySQL data type that can hold up to 4GB of raw binary data.
// - "res.sendStatus()": Express method to immediately set the HTTP status and send its text representation (e.g. 200 OK).
// - "regex.replace()": A utility string method to clean inputs. Here it deletes special path/shell injection characters.

import express from "express";
import path from "path";
import multer from "multer";
import env from "./config/env.js";
import { getDbPool, initializeDatabase } from "./config/db.js";

const originExpressApp = express();

// Configure Multer storage engine in memory
const memoryStorage = multer.memoryStorage();
const uploadMiddleware = multer({ 
    storage: memoryStorage,
    limits: { fileSize: 10 * 1024 * 1024 } // Limit files to 10MB
});

// Parse incoming HTTP requests with JSON payloads
originExpressApp.use(express.json());

// Enable CORS middleware for the origin endpoints
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
 * Returns a list of filenames and metadata (size, upload timestamp).
 * Used at startup by the edge cache to populate its Bloom Filter.
 */
originExpressApp.get("/api/files", async (req, res) => {
    try {
        const dbConnectionPool = getDbPool();
        
        // Query database files.
        // We select only metadata (name, size, timestamp) and omit the large 'content' binary column to save network and RAM overhead.
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
 * Saves a file's binary content directly inside the MySQL database as a LONGBLOB.
 * Uses upsert SQL command (overwrites file if it already exists).
 */
originExpressApp.post("/api/upload", uploadMiddleware.single("file"), async (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file was selected for upload" });
    }

    // Sanitize filename:
    // 1. path.basename removes directory traversal elements (e.g. '../../file.txt' -> 'file.txt')
    // 2. regex replace strips out characters that are not letters, digits, dots, hyphens, or underscores.
    const safeFilename = path.basename(req.file.originalname).replace(/[^a-zA-Z0-9.\-_]/g, "");

    try {
        const dbConnectionPool = getDbPool();
        
        // Execute SQL command with placeholder params ('?') to prevent SQL injections
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
 * Serves a file's raw binary buffer from the database with the correct MIME type header.
 * Queried by the Edge Cache Server on cache misses.
 */
originExpressApp.get("/:filename", async (req, res) => {
    const requestedFilename = req.params.filename;
    if (!requestedFilename) {
        return res.status(400).json({ error: "Filename parameter is required" });
    }

    const safeFilename = path.basename(requestedFilename);

    try {
        const dbConnectionPool = getDbPool();
        
        // Select binary content and MIME type matching the safe name parameter
        const [fileRecordRows] = await dbConnectionPool.query(
            "SELECT content, mime_type FROM origin_files WHERE name = ?", 
            [safeFilename]
        );

        // Return a 404 if no record matches
        if (fileRecordRows.length === 0) {
            console.warn(`Origin Server Database: Requested file "${safeFilename}" not found.`);
            return res.status(404).send("File not found");
        }

        const matchedFileRecord = fileRecordRows[0];
        
        // Write standard Content-Type header so client browser renders binary data correctly
        res.setHeader("Content-Type", matchedFileRecord.mime_type || "application/octet-stream");
        return res.send(matchedFileRecord.content); // Sends raw binary buffer
    } catch (err) {
        console.error(`Error serving file "${safeFilename}" from database:`, err);
        res.status(500).json({ error: "Failed to fetch file from origin database" });
    }
});

/**
 * startOriginServer()
 * Boots the Origin server by:
 *   1. Verifying MySQL database and tables exist.
 *   2. Binding the Express listener port.
 */
const startOriginServer = async () => {
    try {
        // Run database schemas initialization script
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