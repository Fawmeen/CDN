import app from "./app.js";
import env from "./config/env.js";
import { initializeBloomFilter } from "./services/cacheService.js";

/**
 * Main server entry point
 */
const startServer = async () => {
    try {
        // Build the Bloom Filter by querying the origin server inventory
        await initializeBloomFilter();

        const port = env.PORT || 5000;
        app.listen(port, () => {
            console.log(`==================================================`);
            console.log(`Edge Cache CDN Server is running on port ${port}`);
            console.log(`Visual Dashboard is available at http://localhost:${port}`);
            console.log(`==================================================`);
        });
    } catch (err) {
        console.error("Critical: Failed to start Edge Cache Server:", err);
        process.exit(1);
    }
};

startServer();
