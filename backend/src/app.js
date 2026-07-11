import express from "express";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import cacheRoutes from "./routes/cacheRoutes.js";

const app = express();

const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const publicFolder = path.resolve(_dirname, "../public");

// Request logging in development format
app.use(morgan("dev"));

// Body parser
app.use(express.json());

// Simple CORS support
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    res.header("Access-Control-Expose-Headers", "X-Cache, X-Response-Time-MS");
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    next();
});

// Serve frontend visual dashboard statically
app.use(express.static(publicFolder));

// Route handlers for files and administrative endpoints
app.use("/files", cacheRoutes);

export default app;