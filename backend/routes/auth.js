
const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");

const router = express.Router();

// ==========================================
// USER REGISTRATION API
// POST /api/auth/register
// ==========================================

router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Name, email, and password are required."
      });
    }

    // Validate name
    if (typeof name !== "string" || name.trim().length < 2) {
      return res.status(400).json({
        status: "error",
        message: "Name must contain at least 2 characters."
      });
    }

    // Validate email
    if (typeof email !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Please enter a valid email address."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        status: "error",
        message: "Please enter a valid email address."
      });
    }

    // Validate password
    if (typeof password !== "string" || password.length < 8) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 8 characters long."
      });
    }

    // Check existing user
    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        status: "error",
        message: "An account with this email already exists."
      });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Insert user into database
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, name, email, created_at`,
      [name.trim(), normalizedEmail, passwordHash]
    );

    return res.status(201).json({
      status: "success",
      message: "User registered successfully!",
      user: result.rows[0]
    });

  } catch (error) {
    console.error("Registration error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Something went wrong during registration."
    });
  }
});


// ==========================================
// USER LOGIN API
// POST /api/auth/login
// ==========================================

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validate required fields
    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Email and password are required."
      });
    }

    // Validate email
    if (typeof email !== "string") {
      return res.status(400).json({
        status: "error",
        message: "Please enter a valid email address."
      });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return res.status(400).json({
        status: "error",
        message: "Please enter a valid email address."
      });
    }

    // Find user in database
    const result = await pool.query(
      `SELECT id, name, email, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    // Check if user exists
    if (result.rows.length === 0) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password."
      });
    }

    const user = result.rows[0];

    // Compare password with stored hash
    const isPasswordValid = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!isPasswordValid) {
      return res.status(401).json({
        status: "error",
        message: "Invalid email or password."
      });
    }

    // Successful login
    return res.status(200).json({
      status: "success",
      message: "Login successful!",
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        created_at: user.created_at
      }
    });

  } catch (error) {
    console.error("Login error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Something went wrong during login."
    });
  }
});


// Export router
module.exports = router;
