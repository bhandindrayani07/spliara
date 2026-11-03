const express = require("express");
require("dotenv").config();

const pool = require("./config/db");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check with database connection test
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.status(200).json({
      status: "success",
      message: "Spliara backend is running!",
      database: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Database health check failed:", error.message);

    res.status(500).json({
      status: "error",
      message: "Backend is running, but database connection failed.",
      database: "disconnected"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Spliara backend running at http://localhost:${PORT}`);
});