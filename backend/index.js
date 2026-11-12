
const express = require("express");
const path = require("path");
require("dotenv").config();

const pool = require("./config/db");
const authRoutes = require("./routes/auth");
const groupRoutes = require("./routes/groups");
const expenseRoutes = require("./routes/expenses");
const financeRoutes = require("./routes/finance");

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// MIDDLEWARE
// ==========================================

app.use(express.json());
// TEMPORARY: Log incoming API requests
app.use((req, res, next) => {
    console.log("INCOMING REQUEST:", req.method, req.originalUrl);
    next();
});

// Serve frontend files
app.use(express.static(path.join(__dirname, "../frontend")));

// Serve uploaded profile pictures
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ==========================================
// AUTHENTICATION ROUTES
// ==========================================

app.use("/api/auth", authRoutes);

// ==========================================
// GROUP ROUTES
// ==========================================

app.use("/api/groups", groupRoutes);

// ==========================================
// EXPENSE ROUTES
// ==========================================

app.use("/api/expenses", expenseRoutes);

// ==========================================
// FINANCE ROUTES
// ==========================================

app.use("/api/finance", financeRoutes);

// ==========================================
// HEALTH CHECK
// ==========================================

app.get("/health", async (req, res) => {
    try {
        await pool.query("SELECT 1");

        return res.status(200).json({
            status: "success",
            message: "Spliara backend is running!",
            database: "connected",
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        console.error("Database health check failed:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Database connection failed.",
            database: "disconnected"
        });
    }
});

// ==========================================
// START SERVER
// ==========================================

const server = app.listen(PORT, () => {
    console.log(`Spliara backend running at http://localhost:${PORT}`);
});

// Detect if server closes
server.on("close", () => {
    console.log("SPLiARA SERVER CLOSED");
});

// Temporary diagnostic: confirm process remains active
setInterval(() => {
    console.log("Spliara server is still alive");
}, 10000);
