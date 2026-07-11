import fs from "fs";
import path from "path";

/**
 * Ensures that a directory exists, creating it recursively if not.
 * @param {string} dirPath 
 */
export const ensureDirExists = (dirPath) => {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
};

/**
 * Calculates statistics for a given directory (total size in bytes, list of files, file count).
 * @param {string} dirPath 
 * @returns {object} { size: number, count: number, files: Array<{name: string, size: number}> }
 */
export const getDirectoryStats = (dirPath) => {
    ensureDirExists(dirPath);
    const files = fs.readdirSync(dirPath);
    let totalSize = 0;
    const fileList = [];

    for (const filename of files) {
        const filepath = path.join(dirPath, filename);
        try {
            const stats = fs.statSync(filepath);
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
 * Clears all files in a directory (leaving the folder itself).
 * @param {string} dirPath 
 */
export const clearDirectory = (dirPath) => {
    if (!fs.existsSync(dirPath)) return;
    const files = fs.readdirSync(dirPath);
    for (const filename of files) {
        const filepath = path.join(dirPath, filename);
        try {
            if (fs.statSync(filepath).isFile()) {
                fs.unlinkSync(filepath);
            }
        } catch (err) {
            console.error(`Error deleting file ${filename}:`, err);
        }
    }
};

/**
 * Saves a buffer to a file.
 * @param {string} filepath 
 * @param {Buffer} buffer 
 */
export const saveFile = (filepath, buffer) => {
    ensureDirExists(path.dirname(filepath));
    fs.writeFileSync(filepath, buffer);
};

/**
 * Reads a file as buffer. Returns null if not exists.
 * @param {string} filepath 
 * @returns {Buffer|null}
 */
export const readFile = (filepath) => {
    if (fs.existsSync(filepath)) {
        return fs.readFileSync(filepath);
    }
    return null;
};
