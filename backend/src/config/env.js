/**
 * FILE EXPLANATION:
 * This file is responsible for loading, configuring, and exporting the system's 
 * environment variables from the root `.env` file. It acts as a single point of configuration
 * for database details, server ports, and CDN cache policies.
 */

// KEYWORDS EXPLANATION:
// - "import": ES6 module syntax used to load external npm packages (dotenv, path) or built-in modules (url).
// - "export default": Exposes the configuration object so other parts of the backend can import and use it.
// - "process.env": A global object in Node.js that holds the user's environment variable states.
// - "import.meta.url": A built-in property in ES6 modules containing the absolute directory URL of the current module file.
// - "fileURLToPath": Translates the file URL format (file://...) to a standard local file path string (e.g., C:/Users/...).

import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

// Calculate file and directory paths in ES Modules
const _filename = fileURLToPath(import.meta.url);
const _dirname = path.dirname(_filename);

/**
 * dotenv.config(): Loads environment variables from the `.env` file located at the root of the workspace.
 * "path.resolve(...)": Resolves a sequence of paths into an absolute path.
 */
dotenv.config({ path: path.resolve(_dirname, "../../../.env") });

// Export the configuration object containing database connection info and cache thresholds
export default {
    PORT: process.env.PORT,
    ORIGIN_PORT: process.env.ORIGIN_PORT,
    ORIGIN_URL: process.env.ORIGIN_URL,
    MYSQL_HOST: process.env.MYSQL_HOST,
    MYSQL_PORT: process.env.MYSQL_PORT,
    MYSQL_USER: process.env.MYSQL_USER,
    MYSQL_PASSWORD: process.env.MYSQL_PASSWORD,
    MYSQL_DATABASE: process.env.MYSQL_DATABASE,
    CACHE_TTL_SEC: process.env.CACHE_TTL_SEC,
    CACHE_MAX_SIZE_MB: process.env.CACHE_MAX_SIZE_MB
};