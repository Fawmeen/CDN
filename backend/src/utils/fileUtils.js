/**
 * FILE EXPLANATION:
 * This file contains utility helper functions for interacting with the local filesystem (I/O).
 * It encapsulates operations like checking if folders exist, reading/writing files as buffers,
 * cleaning up directories, and calculating folder metrics (total size and file count).
 */

// KEYWORDS EXPLANATION:
// - "fs": Node.js core library used to interact with the file system.
// - "Sync" suffix (e.g., writeFileSync, readFileSync): Synchronous functions that block thread execution until completed.
// - "Buffer": A raw binary memory allocation class in Node.js used to read/write streamable file contents.
// - "path.join(...)": Combines multiple path segments into a unified path string, handling slashes based on the operating system (Windows vs Linux).
// - "path.dirname(...)": Extracts the directory portion of a full filepath string.

import fs from "fs";
import path from "path";

/**
 * ensureDirExists(dirPath)
 * Verifies if the directory path exists. If not, it creates it.
 * - "recursive: true": Ensures all parent directories are created automatically.
 */
export const ensureDirExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

/**
 * getDirectoryStats(dirPath)
 * Iterates through all files inside a directory to calculate:
 *   - The sum of file sizes in bytes.
 *   - The count of active files.
 *   - A list of objects detailing file metadata (name, size, and modified time).
 */
export const getDirectoryStats = (dirPath) => {
    ensureDirExists(dirPath);
    const files = fs.readdirSync(dirPath); // Read list of files
    let totalSize = 0;
    const fileList = [];

    for (const filename of files) {
        const filepath = path.join(dirPath, filename);
        try {
            const stats = fs.statSync(filepath); // Fetch file descriptors
            if (stats.isFile()) {
                totalSize += stats.size;
                fileList.push({
                    name: filename,
                    size: stats.size,
                    mtime: stats.mtime
                });
            }
        } catch (err) {
            console.error(`Error reading stats for file ${filename}:`, err);
        }
    }

    return {
        size: totalSize,
        count: fileList.length,
        files: fileList
    };
};

/**
 * clearDirectory(dirPath)
 * Traverses a folder and deletes every file found inside it, leaving the root folder empty.
 * - "fs.unlinkSync()": Deletes file path resource.
 */
export const clearDirectory = (dirPath) => {
    if (!fs.existsSync(dirPath)) return;
    const files = fs.readdirSync(dirPath);
    for (const filename of files) {
        const filepath = path.join(dirPath, filename);
        try {
            if (fs.statSync(filepath).isFile()) {
                fs.unlinkSync(filepath); // Delete file resource
            }
        } catch (err) {
            console.error(`Error deleting file ${filename}:`, err);
        }
    }
};

/**
 * saveFile(filepath, buffer)
 * Writes raw binary buffer contents to a specified file.
 */
export const saveFile = (filepath, buffer) => {
    ensureDirExists(path.dirname(filepath));
    fs.writeFileSync(filepath, buffer);
};

/**
 * readFile(filepath)
 * Reads file binary contents as a buffer. Returns null if the file doesn't exist.
 */
export const readFile = (filepath) => {
    if (fs.existsSync(filepath)) {
        return fs.readFileSync(filepath);
    }
    return null;
};
