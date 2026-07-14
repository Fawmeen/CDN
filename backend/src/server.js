/**
 * FILE EXPLANATION:
 * This is the main startup entry point (bootstrap script) for the Edge Cache CDN Server.
 * It is responsible for initializing the Bloom Filter from the origin server file inventory
 * and binding the Express app listener to the target port.
 */

// KEYWORDS EXPLANATION:
// - "app.listen()": Binds the Node.js HTTP server socket to a specific port, listening for incoming TCP requests.
// - "process.exit(1)": Immediately terminates the active Node.js server process. Exit code 1 indicates an error.
//   This is useful in containerized environments (like Docker) to trigger container health failure alerts or auto-restarts.

import app from "./app.js";
import env from "./config/env.js";
import { initializeBloomFilter } from "./services/cacheService.js";

/**
 * startServer()
 * Orchestrates startup operations.
 * - Seeds the Bloom Filter.
 * - Configures listening port.
 * - Logs confirmation info.
 */
const startServer = async () => {
    try {
        // Build the Bloom Filter dynamically by querying the origin server file list
        await initializeBloomFilter();

        const port = env.PORT || 5000;
        
        // Listen on target network port
        app.listen(port, () => {
            console.log(`==================================================`);
            console.log(`Edge Cache CDN Server is running on port ${port}`);
            console.log(`Visual Dashboard is available at http://localhost:${port}`);
            console.log(`==================================================`);
        });
    } catch (err) {
        // Shutdown server immediately if startup fails (e.g. invalid config or port clash)
        console.error("Critical: Failed to start Edge Cache Server:", err);
        process.exit(1);
    }
};

startServer();
