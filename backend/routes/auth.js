
const express = require("express");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const multer = require("multer");

const pool = require("../config/db");
const cloudinary = require("../config/cloudinary");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// ==========================================
// PROFILE PICTURE UPLOAD CONFIGURATION
// ==========================================

const fileFilter = (req, file, cb) => {
    const allowedTypes = [
        "image/jpeg",
        "image/png",
        "image/webp"
    ];

    if (allowedTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Only JPG, PNG and WebP images are allowed."));
    }
};

// Store uploaded images temporarily in memory.
// Cloudinary will store them permanently.
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: {
        fileSize: 2 * 1024 * 1024
    }
});

// Upload image buffer to Cloudinary
const uploadToCloudinary = (buffer, userId) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: "spliara/profiles",
                public_id: `profile-${userId}-${Date.now()}`,
                resource_type: "image"
            },
            (error, result) => {
                if (error) {
                    return reject(error);
                }

                resolve(result);
            }
        );

        stream.end(buffer);
    });
};

// ==========================================
// USER REGISTRATION
// POST /api/auth/register
// ==========================================

router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                status: "error",
                message: "Name, email, and password are required."
            });
        }

        if (typeof name !== "string" || name.trim().length < 2) {
            return res.status(400).json({
                status: "error",
                message: "Name must contain at least 2 characters."
            });
        }

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

        if (typeof password !== "string" || password.length < 8) {
            return res.status(400).json({
                status: "error",
                message: "Password must be at least 8 characters long."
            });
        }

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

        const passwordHash = await bcrypt.hash(password, 12);

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
// USER LOGIN
// POST /api/auth/login
// ==========================================

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password || typeof email !== "string") {
            return res.status(400).json({
                status: "error",
                message: "Valid email and password are required."
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

        const result = await pool.query(
            `SELECT id, name, email, password_hash, created_at
             FROM users
             WHERE email = $1`,
            [normalizedEmail]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                status: "error",
                message: "Invalid email or password."
            });
        }

        const user = result.rows[0];

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

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET is not configured.");
        }

        const token = jwt.sign(
            { userId: user.id },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        return res.status(200).json({
            status: "success",
            message: "Login successful!",
            token,
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

// ==========================================
// GET USER PROFILE
// GET /api/auth/profile
// ==========================================

router.get("/profile", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT id, name, email, profile_picture_url,
                    created_at, updated_at
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
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Profile error:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Could not load profile."
        });
    }
});

// ==========================================
// UPDATE USER PROFILE
// PUT /api/auth/profile
// ==========================================

router.put("/profile", authMiddleware, async (req, res) => {
    try {
        const { name, email } = req.body;

        if (
            typeof name !== "string" ||
            name.trim().length < 2 ||
            name.trim().length > 100
        ) {
            return res.status(400).json({
                status: "error",
                message: "Name must contain 2 to 100 characters."
            });
        }

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

        const duplicate = await pool.query(
            `SELECT id FROM users
             WHERE email = $1 AND id != $2`,
            [normalizedEmail, req.user.userId]
        );

        if (duplicate.rows.length > 0) {
            return res.status(409).json({
                status: "error",
                message: "This email address is already in use."
            });
        }

        const result = await pool.query(
            `UPDATE users
             SET name = $1,
                 email = $2,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $3
             RETURNING id, name, email, profile_picture_url,
                       created_at, updated_at`,
            [name.trim(), normalizedEmail, req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "User not found."
            });
        }

        return res.status(200).json({
            status: "success",
            message: "Profile updated successfully!",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Update profile error:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Could not update profile."
        });
    }
});

// ==========================================
// CHANGE PASSWORD
// PUT /api/auth/change-password
// ==========================================

router.put("/change-password", authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (
            typeof currentPassword !== "string" ||
            typeof newPassword !== "string"
        ) {
            return res.status(400).json({
                status: "error",
                message: "Both passwords are required."
            });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({
                status: "error",
                message: "New password must be at least 8 characters."
            });
        }

        const result = await pool.query(
            "SELECT password_hash FROM users WHERE id = $1",
            [req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "User not found."
            });
        }

        const isValid = await bcrypt.compare(
            currentPassword,
            result.rows[0].password_hash
        );

        if (!isValid) {
            return res.status(400).json({
                status: "error",
                message: "Current password is incorrect."
            });
        }

        const newHash = await bcrypt.hash(newPassword, 12);

        await pool.query(
            `UPDATE users
             SET password_hash = $1,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [newHash, req.user.userId]
        );

        return res.status(200).json({
            status: "success",
            message: "Password changed successfully!"
        });

    } catch (error) {
        console.error("Change password error:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Could not change password."
        });
    }
});

// ==========================================
// UPLOAD PROFILE PICTURE
// POST /api/auth/profile-picture
// ==========================================

router.post(
    "/profile-picture",
    authMiddleware,
    (req, res, next) => {
        upload.single("profilePicture")(req, res, error => {
            if (error) {
                return res.status(400).json({
                    status: "error",
                    message: error.code === "LIMIT_FILE_SIZE"
                        ? "Image must be smaller than 2 MB."
                        : error.message
                });
            }

            next();
        });
    },
    async (req, res) => {
        let uploadedImage = null;

        try {
            if (!req.file) {
                return res.status(400).json({
                    status: "error",
                    message: "Please select a picture."
                });
            }

            // Upload image to Cloudinary
            uploadedImage = await uploadToCloudinary(
                req.file.buffer,
                req.user.userId
            );

            const pictureUrl = uploadedImage.secure_url;

            // Save Cloudinary URL in PostgreSQL
            const result = await pool.query(
                `UPDATE users
                 SET profile_picture_url = $1,
                     updated_at = CURRENT_TIMESTAMP
                 WHERE id = $2
                 RETURNING id, name, email, profile_picture_url`,
                [pictureUrl, req.user.userId]
            );

            if (result.rows.length === 0) {
                await cloudinary.uploader.destroy(
                    uploadedImage.public_id
                );

                return res.status(404).json({
                    status: "error",
                    message: "User not found."
                });
            }

            return res.status(200).json({
                status: "success",
                message: "Profile picture uploaded successfully!",
                user: result.rows[0]
            });

        } catch (error) {
            console.error("Picture upload error:", error.message);

            // Remove uploaded image if database update fails
            if (uploadedImage) {
                try {
                    await cloudinary.uploader.destroy(
                        uploadedImage.public_id
                    );
                } catch (cleanupError) {
                    console.error(
                        "Cloudinary cleanup error:",
                        cleanupError.message
                    );
                }
            }

            return res.status(500).json({
                status: "error",
                message: "Could not upload profile picture."
            });
        }
    }
);

// ==========================================
// REMOVE PROFILE PICTURE
// DELETE /api/auth/profile-picture
// ==========================================

router.delete("/profile-picture", authMiddleware, async (req, res) => {
    try {
        const result = await pool.query(
            `UPDATE users
             SET profile_picture_url = NULL,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $1
             RETURNING id, name, email, profile_picture_url`,
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
            message: "Profile picture removed.",
            user: result.rows[0]
        });

    } catch (error) {
        console.error("Remove picture error:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Could not remove profile picture."
        });
    }
});

module.exports = router;
