
const express = require("express");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Protect all group routes
router.use(authMiddleware);

// CREATE GROUP
// POST /api/groups
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Group name is required."
      });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({
        status: "error",
        message: "Group name cannot exceed 100 characters."
      });
    }

    const result = await pool.query(
      `INSERT INTO groups (name, created_by)
       VALUES ($1, $2)
       RETURNING *`,
      [name.trim(), req.user.userId]
    );

    return res.status(201).json({
      status: "success",
      message: "Group created successfully!",
      group: result.rows[0]
    });

  } catch (error) {
    console.error("Create group error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to create group."
    });
  }
});

// READ ALL GROUPS
// GET /api/groups
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT *
       FROM groups
       WHERE created_by = $1
       ORDER BY created_at DESC`,
      [req.user.userId]
    );

    return res.status(200).json({
      status: "success",
      count: result.rows.length,
      groups: result.rows
    });

  } catch (error) {
    console.error("Get groups error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve groups."
    });
  }
});

// READ ONE GROUP
// GET /api/groups/:id
router.get("/:id", async (req, res) => {
  try {
    const groupId = Number(req.params.id);

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid group ID."
      });
    }

    const result = await pool.query(
      `SELECT *
       FROM groups
       WHERE id = $1 AND created_by = $2`,
      [groupId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Group not found."
      });
    }

    return res.status(200).json({
      status: "success",
      group: result.rows[0]
    });

  } catch (error) {
    console.error("Get group error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve group."
    });
  }
});

// UPDATE GROUP
// PUT /api/groups/:id
router.put("/:id", async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { name } = req.body;

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid group ID."
      });
    }

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        status: "error",
        message: "A valid group name is required."
      });
    }

    if (name.trim().length > 100) {
      return res.status(400).json({
        status: "error",
        message: "Group name cannot exceed 100 characters."
      });
    }

    const result = await pool.query(
      `UPDATE groups
       SET name = $1
       WHERE id = $2 AND created_by = $3
       RETURNING *`,
      [name.trim(), groupId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Group not found."
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Group updated successfully!",
      group: result.rows[0]
    });

  } catch (error) {
    console.error("Update group error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to update group."
    });
  }
});

// DELETE GROUP
// DELETE /api/groups/:id
router.delete("/:id", async (req, res) => {
  try {
    const groupId = Number(req.params.id);

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid group ID."
      });
    }

    const result = await pool.query(
      `DELETE FROM groups
       WHERE id = $1 AND created_by = $2
       RETURNING id, name`,
      [groupId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Group not found."
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Group deleted successfully!",
      group: result.rows[0]
    });

  } catch (error) {
    console.error("Delete group error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to delete group."
    });
  }
});

module.exports = router;
