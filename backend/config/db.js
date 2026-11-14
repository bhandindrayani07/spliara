
const { Pool } = require("pg");

// Use Neon when DATABASE_URL is available.
// Otherwise, use the local PostgreSQL database.
const pool = process.env.DATABASE_URL
    ? new Pool({
        connectionString: process.env.DATABASE_URL,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000
    })
    : new Pool({
        user: process.env.DB_USER,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        password: process.env.DB_PASSWORD || undefined,
        port: Number(process.env.DB_PORT) || 5432
    });

// Database connection confirmation
pool.on("connect", () => {
    console.log(
        process.env.DATABASE_URL
            ? "Connected to Neon PostgreSQL!"
            : "Connected to local PostgreSQL!"
    );
});

// Database error handling
pool.on("error", (error) => {
    console.error("Unexpected database error:", error.message);
});

// Temporary database pool monitoring
const poolMonitor = setInterval(() => {
    console.log("DATABASE POOL:", {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
    });
}, 15000);

// Allow Node.js to exit normally when the server is stopped.
poolMonitor.unref();

module.exports = pool;
