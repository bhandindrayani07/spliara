
const { Pool } = require("pg");

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || undefined,
  port: Number(process.env.DB_PORT) || 5432
});

pool.on("connect", () => {
  console.log("Connected to Spliara PostgreSQL database!");
});

pool.on("error", (error) => {
  console.error("Unexpected database error:", error.message);
});

module.exports = pool;
