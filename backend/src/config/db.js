import mysql from 'mysql2/promise';
import env from './env.js';

// Global variable holding the main connection pool singleton instance
let mainDbPool;

/**
 * Returns the configured MySQL connection pool.
 * Initializes the pool singleton if it does not exist.
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
 * Automatically creates the database if it doesn't exist, and compiles the files schema table.
 * Designed to execute once during server bootstrap.
 */
export const initializeDatabase = async () => {
    // 1. Establish a temporary connection pool without selecting a database first.
    // This allows us to run "CREATE DATABASE IF NOT EXISTS".
    const mysqlHost = env.MYSQL_HOST || 'localhost';
    const mysqlUser = env.MYSQL_USER || 'root';
    const mysqlPassword = env.MYSQL_PASSWORD || 'rootpassword';
    const mysqlPort = parseInt(env.MYSQL_PORT, 10) || 3306;
    const targetDatabaseName = env.MYSQL_DATABASE || 'edgecache_db';

    console.log(`Connecting to MySQL at ${mysqlHost}:${mysqlPort} to verify database state...`);

    const tempInitConnectionPool = mysql.createPool({
        host: mysqlHost,
        user: mysqlUser,
        password: mysqlPassword,
        port: mysqlPort
    });

    try {
        const tempDbConnection = await tempInitConnectionPool.getConnection();
        
        // Execute the database creation command
        await tempDbConnection.query(`CREATE DATABASE IF NOT EXISTS \`${targetDatabaseName}\``);
        tempDbConnection.release();
        
        // Destroy the temporary pool
        await tempInitConnectionPool.end();
        console.log(`Database '${targetDatabaseName}' verified/created successfully.`);
    } catch (err) {
        console.error("Failed to ensure database existence:", err.message);
        await tempInitConnectionPool.end();
        throw err;
    }

    // 2. Establish a connection from the main pool to verify/compile table schema structures
    const initializedPool = getDbPool();
    try {
        const schemaSetupConnection = await initializedPool.getConnection();
        
        // Compile the table schema inside the target database
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
        schemaSetupConnection.release();
        console.log("Origin files database table verified/created.");
    } catch (err) {
        console.error("Failed to compile database schema:", err.message);
        throw err;
    }
};
