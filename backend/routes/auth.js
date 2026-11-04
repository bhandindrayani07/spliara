const express = require("express");
const bcrypt = require("bcrypt");
const pool = require("../config/db");

const router = express.Router();

// User Registration API
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
    if (name.trim().length < 2) {
      return res.status(400).json({
        status: "error",
        message: "Name must contain at least 2 characters."
      });
    }

    // Validate email format
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

    // Check whether email already exists
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

    // Save user
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

module.exports = router;