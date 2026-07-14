/**
 * FILE EXPLANATION:
 * This service handles HTTP network requests from the Edge Cache server to the Origin Server.
 * Since the Edge Cache proxy sits in front of the origin, it calls this service on cache misses
 * to fetch original files, or at startup to query the list of available files to seed the Bloom Filter.
 */

// KEYWORDS EXPLANATION:
// - "axios": A Promise-based HTTP client for Node.js used to perform REST API requests.
// - "timeout": Aborts the HTTP request if the origin server does not respond within the specified milliseconds (e.g. 3000ms).
// - "responseType: 'arraybuffer'": Critical setting that instructs axios to return the raw binary data (e.g. image, PDF content) rather than parsing it as a string or JSON.
// - "Buffer.from()": Encapsulates raw array buffer bytes into a standard Node.js Buffer structure, allowing safe saving to disk.

import axios from "axios";
import env from "../config/env.js";

/**
 * fetchFilesList()
 * Queries the origin server's API for the names of all registered files.
 * This is used to dynamically build and populate the Bloom Filter.
 * @returns {Promise<string[]>} List of filenames
 */
export const fetchFilesList = async () => {
    try {
        // Send a GET request to the origin API. If it takes longer than 3 seconds, throw a timeout error.
        const response = await axios.get(`${env.ORIGIN_URL}/api/files`, { timeout: 3000 });
        
        // Ensure the response contains the list of files as an array
        if (response.data && Array.isArray(response.data.files)) {
            return response.data.files;
        }
        return [];
    } catch (err) {
        console.error(`Failed to fetch file list from origin (${env.ORIGIN_URL}):`, err.message);
        // Return an empty array to prevent the system from crashing if the origin is offline
        return [];
    }
};

/**
 * fetchFileFromOrigin(filename)
 * Downloads a specific binary file and its MIME type from the origin server.
 * @param {string} filename - The name of the file to query
 * @returns {Promise<{ data: Buffer, contentType: string } | null>} File buffer data and content type, or null
 */
export const fetchFileFromOrigin = async (filename) => {
    try {
        // Fetch raw binary buffer from origin with a 5-second timeout
        const response = await axios.get(`${env.ORIGIN_URL}/${filename}`, {
            responseType: "arraybuffer",
            timeout: 5000
        });

        return {
            data: Buffer.from(response.data),
            contentType: response.headers["content-type"] || "application/octet-stream"
        };
    } catch (err) {
        // Log a warning if it's a standard 404 (not found) or log an error for database/connection issues
        if (err.response && err.response.status === 404) {
            console.warn(`File ${filename} not found on origin.`);
        } else {
            console.error(`Error fetching file ${filename} from origin:`, err.message);
        }
        return null;
    }
};
