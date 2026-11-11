
const express = require("express");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Protect all group routes
router.use(authMiddleware);

// Helper: check whether the logged-in user owns a group
async function isGroupOwner(groupId, userId) {
  const result = await pool.query(
    `SELECT id FROM groups
     WHERE id = $1 AND created_by = $2`,
    [groupId, userId]
  );

  return result.rows.length > 0;
}

// Helper: check whether the logged-in user belongs to a group
async function isGroupMember(groupId, userId) {
  const result = await pool.query(
    `SELECT id FROM group_members
     WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId]
  );

  return result.rows.length > 0;
}

// CREATE GROUP
// POST /api/groups
router.post("/", async (req, res) => {
  const client = await pool.connect();

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

    await client.query("BEGIN");

    const groupResult = await client.query(
      `INSERT INTO groups (name, created_by)
       VALUES ($1, $2)
       RETURNING *`,
      [name.trim(), req.user.userId]
    );

    const group = groupResult.rows[0];

    // Automatically add the creator as the first group member
    await client.query(
      `INSERT INTO group_members (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [group.id, req.user.userId]
    );

    await client.query("COMMIT");

    return res.status(201).json({
      status: "success",
      message: "Group created successfully!",
      group
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create group error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to create group."
    });

  } finally {
    client.release();
  }
});

// READ ALL GROUPS
// GET /api/groups
router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT g.*
       FROM groups g
       INNER JOIN group_members gm ON g.id = gm.group_id
       WHERE gm.user_id = $1
       ORDER BY g.created_at DESC`,
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

// ADD GROUP MEMBER
// POST /api/groups/:id/members
router.post("/:id/members", async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const { email } = req.body;

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid group ID."
      });
    }

    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Member email is required."
      });
    }

    // Only the group creator can add members
    const owner = await isGroupOwner(groupId, req.user.userId);

    if (!owner) {
      return res.status(403).json({
        status: "error",
        message: "Only the group creator can add members."
      });
    }

    // Find an existing registered user
    const userResult = await pool.query(
      `SELECT id, name, email
       FROM users
       WHERE LOWER(email) = LOWER($1)`,
      [email.trim()]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "No registered user found with this email."
      });
    }

    const member = userResult.rows[0];

    const result = await pool.query(
      `INSERT INTO group_members (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING
       RETURNING id`,
      [groupId, member.id]
    );

    if (result.rows.length === 0) {
      return res.status(409).json({
        status: "error",
        message: "This user is already a group member."
      });
    }

    return res.status(201).json({
      status: "success",
      message: "Member added successfully!",
      member
    });

  } catch (error) {
    console.error("Add member error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to add group member."
    });
  }
});

// GET GROUP MEMBERS
// GET /api/groups/:id/members
router.get("/:id/members", async (req, res) => {
  try {
    const groupId = Number(req.params.id);

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid group ID."
      });
    }

    const member = await isGroupMember(groupId, req.user.userId);

    if (!member) {
      return res.status(403).json({
        status: "error",
        message: "You are not a member of this group."
      });
    }

    const result = await pool.query(
      `SELECT u.id, u.name, u.email, gm.joined_at
       FROM group_members gm
       INNER JOIN users u ON gm.user_id = u.id
       WHERE gm.group_id = $1
       ORDER BY gm.joined_at ASC`,
      [groupId]
    );

    return res.status(200).json({
      status: "success",
      count: result.rows.length,
      members: result.rows
    });

  } catch (error) {
    console.error("Get members error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve group members."
    });
  }
});

// REMOVE GROUP MEMBER
// DELETE /api/groups/:id/members/:userId
router.delete("/:id/members/:userId", async (req, res) => {
  try {
    const groupId = Number(req.params.id);
    const memberId = Number(req.params.userId);

    if (
      !Number.isInteger(groupId) || groupId <= 0 ||
      !Number.isInteger(memberId) || memberId <= 0
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid group or member ID."
      });
    }

    // Only the group creator can remove members
    const owner = await isGroupOwner(groupId, req.user.userId);

    if (!owner) {
      return res.status(403).json({
        status: "error",
        message: "Only the group creator can remove members."
      });
    }

    // The creator cannot remove themselves
    if (memberId === req.user.userId) {
      return res.status(400).json({
        status: "error",
        message: "The group creator cannot be removed."
      });
    }

    // Check whether the member has financial activity in this group
    const activityResult = await pool.query(
      `SELECT
        EXISTS (
          SELECT 1
          FROM expenses
          WHERE group_id = $1 AND paid_by = $2
        )
        OR EXISTS (
          SELECT 1
          FROM expense_splits es
          INNER JOIN expenses e ON es.expense_id = e.id
          WHERE e.group_id = $1 AND es.user_id = $2
        )
        OR EXISTS (
          SELECT 1
          FROM settlements
          WHERE group_id = $1
          AND (paid_by = $2 OR received_by = $2)
        ) AS has_activity`,
      [groupId, memberId]
    );

    if (activityResult.rows[0].has_activity) {
      return res.status(409).json({
        status: "error",
        message: "This member has financial activity in the group and cannot be removed."
      });
    }

    const result = await pool.query(
      `DELETE FROM group_members
       WHERE group_id = $1 AND user_id = $2
       RETURNING user_id`,
      [groupId, memberId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Group member not found."
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Member removed successfully!"
    });

  } catch (error) {
    console.error("Remove member error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to remove group member."
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

    const member = await isGroupMember(groupId, req.user.userId);

    if (!member) {
      return res.status(404).json({
        status: "error",
        message: "Group not found."
      });
    }

    const result = await pool.query(
      `SELECT * FROM groups WHERE id = $1`,
      [groupId]
    );

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
