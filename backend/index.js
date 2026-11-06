
const express = require("express");
require("dotenv").config();

const pool = require("./config/db");
const authRoutes = require("./routes/auth");
const authMiddleware = require("./middleware/authMiddleware");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Authentication routes
app.use("/api/auth", authRoutes);

// ==========================================
// PROTECTED PROFILE API
// GET /api/auth/profile
// ==========================================

app.get("/api/auth/profile", authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, email, created_at
       FROM users
       WHERE id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "User not found."
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Profile accessed successfully!",
      user: result.rows[0]
    });

  } catch (error) {
    console.error("Profile error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve profile."
    });
  }
});

// ==========================================
// HEALTH CHECK
// GET /health
// ==========================================

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
      message: "Database connection failed.",
      database: "disconnected"
    });
  }
});

app.listen(PORT, () => {
  console.log(`Spliara backend running at http://localhost:${PORT}`);
});
