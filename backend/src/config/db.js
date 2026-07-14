/**
 * FILE EXPLANATION:
 * This file is responsible for managing the connection pool to the MySQL database.
 * It contains functions to initialize the database and tables dynamically if they 
 * do not exist when the backend starts up (database schema creation).
 */

// KEYWORDS EXPLANATION:
// - "mysql2/promise": An extension of the standard Node MySQL client supporting ES6 Promises and async/await syntax.
// - "mysql.createPool()": Instantiates a database connection pool. Reusing connections is much faster than opening a new TCP connection for every query.
// - "getConnection()": Requests an active database connection thread from the pool.
// - "release()": Returns the connection back to the pool so it can be reused by another query.
// - "tempDbConnection.release()": Frees up the connection immediately after execution.
// - "async": Declares that a function executes asynchronously and implicitly returns a Promise.
// - "await": Blocks execution within an async function until a Promise resolves or rejects.
// - "try...catch": Catch block that handles errors that occur inside the try block without crashing the server.

import mysql from 'mysql2/promise';
import env from './env.js';

// Global variable holding the main connection pool singleton instance
let mainDbPool;

/**
 * getDbPool()
 * Retrieves the configured MySQL connection pool.
 * Initializes the pool singleton if it does not already exist.
 * 
 * Configured Pool Options:
 * - connectionLimit: Maximum active connections to open simultaneously.
 * - queueLimit: Max backlog requests waiting for connection (0 = infinite).
 */
export const getDbPool = () => {
    if (!mainDbPool) {
        mainDbPool = mysql.createPool({
            host: env.MYSQL_HOST || 'localhost',
            user: env.MYSQL_USER || 'root',
            password: env.MYSQL_PASSWORD || 'rootpassword',
            database: env.MYSQL_DATABASE || 'edgecache_db',
            port: parseInt(env.MYSQL_PORT, 10) || 3306,
            waitForConnections: true,
            connectionLimit: 10,
            queueLimit: 0
        });
    }
    return mainDbPool;
};

/**
 * initializeDatabase()
 * Bootstraps the database and files schema dynamically.
 * Runs in two stages:
 *   1. Connects to MySQL root (no database) to run `CREATE DATABASE`.
 *   2. Connects to target database using `getDbPool()` to run `CREATE TABLE`.
 */
export const initializeDatabase = async () => {
    const mysqlHost = env.MYSQL_HOST || 'localhost';
    const mysqlUser = env.MYSQL_USER || 'root';
    const mysqlPassword = env.MYSQL_PASSWORD || 'rootpassword';
    const mysqlPort = parseInt(env.MYSQL_PORT, 10) || 3306;
    const targetDatabaseName = env.MYSQL_DATABASE || 'edgecache_db';

    console.log(`Connecting to MySQL at ${mysqlHost}:${mysqlPort} to verify database state...`);

    // 1. Temporary connection pool without targeting any specific database
    const tempInitConnectionPool = mysql.createPool({
        host: mysqlHost,
        user: mysqlUser,
        password: mysqlPassword,
        port: mysqlPort
    });

    try {
        const tempDbConnection = await tempInitConnectionPool.getConnection();
        
        // Execute the database creation command if it's missing
        await tempDbConnection.query(`CREATE DATABASE IF NOT EXISTS \`${targetDatabaseName}\``);
        tempDbConnection.release(); // Return back to the temporary pool
        
        // Destroy the temporary pool since database is verified
        await tempInitConnectionPool.end();
        console.log(`Database '${targetDatabaseName}' verified/created successfully.`);
    } catch (err) {
        console.error("Failed to ensure database existence:", err.message);
        await tempInitConnectionPool.end();
        throw err;
    }

    // 2. Main pool connection to check and generate the file schema structure
    const initializedPool = getDbPool();
    try {
        const schemaSetupConnection = await initializedPool.getConnection();
        
        // Create the files table.
        // Longblob stores binary files like resumes/images up to 4GB.
        await schemaSetupConnection.query(`
            CREATE TABLE IF NOT EXISTS origin_files (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(255) UNIQUE NOT NULL,
                size INT NOT NULL,
                content LONGBLOB NOT NULL,
                mime_type VARCHAR(100) NOT NULL,
                uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        schemaSetupConnection.release(); // Return connection back to main pool
        console.log("Origin files database table verified/created.");
    } catch (err) {
        console.error("Failed to compile database schema:", err.message);
        throw err;
    }
};
