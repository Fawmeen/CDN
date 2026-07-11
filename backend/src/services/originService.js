import axios from "axios";
import env from "../config/env.js";

/**
 * Origin Service
 * Manages communication with the Origin server (port 9000).
 */

/**
 * Fetches the list of all files stored on the origin server.
 * Used at startup to populate the Bloom Filter.
 * @returns {Promise<string[]>} List of filenames
 */
export const fetchFilesList = async () => {
    try {
        const response = await axios.get(`${env.ORIGIN_URL}/api/files`, { timeout: 3000 });
        if (response.data && Array.isArray(response.data.files)) {
            return response.data.files;
        }
        return [];
    } catch (err) {
        console.error(`Failed to fetch file list from origin (${env.ORIGIN_URL}):`, err.message);
        // Return empty array if origin is not reachable
        return [];
    }
};

/**
 * Fetches a file's binary content and metadata from the origin server.
 * @param {string} filename 
 * @returns {Promise<{ data: Buffer, contentType: string } | null>} File data and type, or null if not found
 */
export const fetchFileFromOrigin = async (filename) => {
    try {
        // Fetch raw binary buffer from origin
        const response = await axios.get(`${env.ORIGIN_URL}/${filename}`, {
            responseType: "arraybuffer",
            timeout: 5000
        });

        return {
            data: Buffer.from(response.data),
            contentType: response.headers["content-type"] || "application/octet-stream"
        };
    } catch (err) {
        if (err.response && err.response.status === 404) {
            console.warn(`File ${filename} not found on origin.`);
        } else {
            console.error(`Error fetching file ${filename} from origin:`, err.message);
        }
        return null;
    }
};
