/**
 * FILE EXPLANATION:
 * This file initializes the Express application instance, configures global middlewares 
 * (CORS, body parser, and logger), and binds the root router routes.
 */

// KEYWORDS EXPLANATION:
// - "express()": Instantiates the Express application server.
// - "app.use()": Registers middleware functions globally. Middleware functions execute sequentially in the request-response lifecycle.
// - "morgan('dev')": Third-party logger middleware that logs HTTP requests (method, status, duration) to the console.
// - "express.json()": Built-in middleware that parses incoming requests with JSON payloads (attaches parsed objects to `req.body`).
// - "next()": Express callback function that hands over execution to the next middleware function in the pipeline.
// - "express.static()": Middleware that serves static assets (HTML, CSS, JS) from a target folder.
// - "Access-Control-Expose-Headers": Tells client browsers they are permitted to read custom response headers (like X-Cache).

import express from "express";
import morgan from "morgan";
import path from "path";
import { fileURLToPath } from "url";
import cacheRoutes from "./routes/cacheRoutes.js";

const app = express();

// Path calculations in ES6 modules
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);
const publicFolder = path.resolve(_dirname, "../public");

// Setup development request logger
app.use(morgan("dev"));

// Setup JSON parsing middleware
app.use(express.json());

// Setup CORS (Cross-Origin Resource Sharing) middleware
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    
    // Explicitly expose custom headers so our React client can read cache hit/miss data and performance time
    res.header("Access-Control-Expose-Headers", "X-Cache, X-Response-Time-MS");
    
    // Intercept preflight OPTIONS requests immediately returning 200 OK
    if (req.method === "OPTIONS") {
        return res.sendStatus(200);
    }
    
    next(); // Pass control to the next route or middleware
});

// Serve frontend assets statically
app.use(express.static(publicFolder));

// Bind all files and cache management routes to `/files` prefix
app.use("/files", cacheRoutes);

export default app;