
const express = require("express");
const crypto = require("crypto");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Protect all group routes
router.use(authMiddleware);

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function isGroupOwner(groupId, userId) {
  const result = await pool.query(
    `SELECT id FROM groups
     WHERE id = $1 AND created_by = $2`,
    [groupId, userId]
  );

  return result.rows.length > 0;
}

async function isGroupMember(groupId, userId) {
  const result = await pool.query(
    `SELECT id FROM group_members
     WHERE group_id = $1 AND user_id = $2`,
    [groupId, userId]
  );

  return result.rows.length > 0;
}

// ==========================================
// CREATE GROUP
// POST /api/groups
// ==========================================

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

// ==========================================
// READ ALL GROUPS
// GET /api/groups
// ==========================================

router.get("/", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        g.*,
        (
          SELECT COUNT(*)::int
          FROM group_members gm2
          WHERE gm2.group_id = g.id
        ) AS member_count,
        COALESCE(
          (
            SELECT json_agg(
              json_build_object(
                'id', u.id,
                'name', u.name
              )
              ORDER BY gm2.joined_at ASC
            )
            FROM group_members gm2
            INNER JOIN users u ON u.id = gm2.user_id
            WHERE gm2.group_id = g.id
          ),
          '[]'::json
        ) AS members,
        COALESCE(
          (
            SELECT SUM(e.amount)
            FROM expenses e
            WHERE e.group_id = g.id
          ),
          0
        ) AS total_expenses
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

// ==========================================
// ADD MEMBER OR CREATE INVITATION LINK
// POST /api/groups/:id/members
// ==========================================

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

    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Email address is required."
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

    const owner = await isGroupOwner(groupId, req.user.userId);

    if (!owner) {
      return res.status(403).json({
        status: "error",
        message: "Only the group creator can add members."
      });
    }

    const groupResult = await pool.query(
      `SELECT id, name FROM groups WHERE id = $1`,
      [groupId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Group not found."
      });
    }

    const currentUser = await pool.query(
      `SELECT name, email FROM users WHERE id = $1`,
      [req.user.userId]
    );

    if (
      currentUser.rows.length === 0 ||
      currentUser.rows[0].email.toLowerCase() === normalizedEmail
    ) {
      return res.status(400).json({
        status: "error",
        message: "You cannot add yourself."
      });
    }

    // Check whether the person is registered.
    const userResult = await pool.query(
      `SELECT id, name, email
       FROM users
       WHERE LOWER(email) = $1`,
      [normalizedEmail]
    );

    // ==========================================
    // REGISTERED USER: ADD DIRECTLY
    // ==========================================

    if (userResult.rows.length > 0) {
      const invitedUser = userResult.rows[0];

      const alreadyMember = await isGroupMember(
        groupId,
        invitedUser.id
      );

      if (alreadyMember) {
        return res.status(409).json({
          status: "error",
          message: "This person is already a group member."
        });
      }

      const client = await pool.connect();

      try {
        await client.query("BEGIN");

        await client.query(
          `INSERT INTO group_members (group_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (group_id, user_id) DO NOTHING`,
          [groupId, invitedUser.id]
        );

        await client.query(
          `UPDATE group_invitations
           SET status = 'cancelled'
           WHERE group_id = $1
           AND LOWER(invited_email) = $2
           AND status = 'pending'`,
          [groupId, normalizedEmail]
        );

        await client.query("COMMIT");

        return res.status(200).json({
          status: "success",
          addedDirectly: true,
          message: `${invitedUser.name} has been added to the group!`
        });

      } catch (error) {
        await client.query("ROLLBACK");
        throw error;

      } finally {
        client.release();
      }
    }

    // ==========================================
    // UNREGISTERED USER: CREATE INVITATION LINK
    // ==========================================

    const invitationToken = crypto.randomBytes(32).toString("hex");

    const tokenHash = crypto
      .createHash("sha256")
      .update(invitationToken)
      .digest("hex");

    // Expire previous expired invitations.
    await pool.query(
      `UPDATE group_invitations
       SET status = 'expired'
       WHERE group_id = $1
       AND LOWER(invited_email) = $2
       AND status = 'pending'
       AND expires_at <= CURRENT_TIMESTAMP`,
      [groupId, normalizedEmail]
    );

    // Check for an existing pending invitation.
    const existingInvitation = await pool.query(
      `SELECT id
       FROM group_invitations
       WHERE group_id = $1
       AND LOWER(invited_email) = $2
       AND status = 'pending'
       AND expires_at > CURRENT_TIMESTAMP
       LIMIT 1`,
      [groupId, normalizedEmail]
    );

    let invitation;

    if (existingInvitation.rows.length > 0) {
      // Refresh the existing invitation link.
      const updatedInvitation = await pool.query(
        `UPDATE group_invitations
         SET token_hash = $1,
             invited_by = $2,
             created_at = CURRENT_TIMESTAMP,
             expires_at = CURRENT_TIMESTAMP + INTERVAL '7 days'
         WHERE id = $3
         RETURNING id, group_id, invited_email, status,
                   created_at, expires_at`,
        [
          tokenHash,
          req.user.userId,
          existingInvitation.rows[0].id
        ]
      );

      invitation = updatedInvitation.rows[0];

    } else {
      // Create a new invitation.
      const newInvitation = await pool.query(
        `INSERT INTO group_invitations
         (group_id, invited_by, invited_email, token_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, group_id, invited_email, status,
                   created_at, expires_at`,
        [
          groupId,
          req.user.userId,
          normalizedEmail,
          tokenHash
        ]
      );

      invitation = newInvitation.rows[0];
    }

    const frontendURL = (
      process.env.FRONTEND_URL ||
      req.get("origin") ||
      `${req.protocol}://${req.get("host")}`
    ).replace(/\/$/, "");

    const invitationLink =
      `${frontendURL}/accept-invitation.html?token=${invitationToken}`;

    return res.status(201).json({
      status: "success",
      addedDirectly: false,
      message: "Invitation link created successfully!",
      invitation,
      invitationLink
    });

  } catch (error) {
    console.error("Add member or invitation error:", error.message);

    if (error.code === "23505") {
      return res.status(409).json({
        status: "error",
        message: "A pending invitation already exists for this email."
      });
    }

    return res.status(500).json({
      status: "error",
      message: "Unable to add member or create invitation."
    });
  }
});

// ==========================================
// GET INVITATIONS FOR A GROUP
// GET /api/groups/:id/invitations
// ==========================================

router.get("/:id/invitations", async (req, res) => {
  try {
    const groupId = Number(req.params.id);

    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid group ID."
      });
    }

    const owner = await isGroupOwner(groupId, req.user.userId);

    if (!owner) {
      return res.status(403).json({
        status: "error",
        message: "Only the group creator can view invitations."
      });
    }

    await pool.query(
      `UPDATE group_invitations
       SET status = 'expired'
       WHERE group_id = $1
       AND status = 'pending'
       AND expires_at <= CURRENT_TIMESTAMP`,
      [groupId]
    );

    const result = await pool.query(
      `SELECT
        id,
        invited_email,
        status,
        created_at,
        expires_at
       FROM group_invitations
       WHERE group_id = $1
       ORDER BY created_at DESC`,
      [groupId]
    );

    return res.status(200).json({
      status: "success",
      count: result.rows.length,
      invitations: result.rows
    });

  } catch (error) {
    console.error("Get invitations error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve invitations."
    });
  }
});

// ==========================================
// GET MY RECEIVED INVITATIONS
// GET /api/groups/invitations/my
// ==========================================

router.get("/invitations/my", async (req, res) => {
  try {
    const userResult = await pool.query(
      `SELECT email FROM users WHERE id = $1`,
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "User not found."
      });
    }

    const email = userResult.rows[0].email.toLowerCase();

    await pool.query(
      `UPDATE group_invitations
       SET status = 'expired'
       WHERE LOWER(invited_email) = $1
       AND status = 'pending'
       AND expires_at <= CURRENT_TIMESTAMP`,
      [email]
    );

    const result = await pool.query(
      `SELECT
        gi.id AS invitation_id,
        gi.group_id,
        gi.invited_email,
        gi.status,
        gi.created_at,
        gi.expires_at,
        g.name AS group_name,
        u.name AS invited_by_name
       FROM group_invitations gi
       INNER JOIN groups g ON g.id = gi.group_id
       INNER JOIN users u ON u.id = gi.invited_by
       WHERE LOWER(gi.invited_email) = $1
       AND gi.status = 'pending'
       AND gi.expires_at > CURRENT_TIMESTAMP
       ORDER BY gi.created_at DESC`,
      [email]
    );

    return res.status(200).json({
      status: "success",
      count: result.rows.length,
      invitations: result.rows
    });

  } catch (error) {
    console.error("My invitations error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to retrieve invitations."
    });
  }
});

// ==========================================
// ACCEPT INVITATION USING SECURE LINK
// POST /api/groups/invitations/accept-link
// ==========================================

router.post("/invitations/accept-link", async (req, res) => {
  const client = await pool.connect();
  let transactionStarted = false;

  try {
    const { token } = req.body;

    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{64}$/i.test(token)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid invitation link."
      });
    }

    const tokenHash = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    await client.query("BEGIN");
    transactionStarted = true;

    const userResult = await client.query(
      `SELECT id, email
       FROM users
       WHERE id = $1`,
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        status: "error",
        message: "User not found."
      });
    }

    const user = userResult.rows[0];

    const invitationResult = await client.query(
      `SELECT *
       FROM group_invitations
       WHERE token_hash = $1
       FOR UPDATE`,
      [tokenHash]
    );

    if (invitationResult.rows.length === 0) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(404).json({
        status: "error",
        message: "Invitation link is invalid or no longer available."
      });
    }

    const invitation = invitationResult.rows[0];

    if (
      invitation.invited_email.toLowerCase() !==
      user.email.toLowerCase()
    ) {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(403).json({
        status: "error",
        message: "Please log in using the email address this invitation was created for."
      });
    }

    if (invitation.status !== "pending") {
      await client.query("ROLLBACK");
      transactionStarted = false;

      return res.status(409).json({
        status: "error",
        message: "This invitation is no longer pending."
      });
    }

    if (new Date(invitation.expires_at) <= new Date()) {
      await client.query(
        `UPDATE group_invitations
         SET status = 'expired'
         WHERE id = $1`,
        [invitation.id]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(410).json({
        status: "error",
        message: "This invitation has expired."
      });
    }

    await client.query(
      `INSERT INTO group_members (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [invitation.group_id, user.id]
    );

    await client.query(
      `UPDATE group_invitations
       SET status = 'accepted',
           accepted_by = $1,
           accepted_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [user.id, invitation.id]
    );

    const groupResult = await client.query(
      `SELECT id, name
       FROM groups
       WHERE id = $1`,
      [invitation.group_id]
    );

    if (groupResult.rows.length === 0) {
      throw new Error("The invited group no longer exists.");
    }

    await client.query("COMMIT");
    transactionStarted = false;

    return res.status(200).json({
      status: "success",
      message: `You have successfully joined ${groupResult.rows[0].name}!`,
      group: groupResult.rows[0]
    });

  } catch (error) {
    if (transactionStarted) {
      await client.query("ROLLBACK");
    }

    console.error("Accept link error:", error.message);

    return res.status(500).json({
      status: "error",
      message: "Unable to accept this invitation."
    });

  } finally {
    client.release();
  }
});

// ==========================================
// ACCEPT GROUP INVITATION BY ID
// POST /api/groups/invitations/:invitationId/accept
// ==========================================

router.post(
  "/invitations/:invitationId/accept",
  async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
      const invitationId = Number(req.params.invitationId);

      if (!Number.isInteger(invitationId) || invitationId <= 0) {
        return res.status(400).json({
          status: "error",
          message: "Invalid invitation ID."
        });
      }

      const userResult = await client.query(
        `SELECT id, email
         FROM users
         WHERE id = $1`,
        [req.user.userId]
      );

      if (userResult.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "User not found."
        });
      }

      const user = userResult.rows[0];

      await client.query("BEGIN");
      transactionStarted = true;

      const invitationResult = await client.query(
        `SELECT *
         FROM group_invitations
         WHERE id = $1
         AND LOWER(invited_email) = LOWER($2)
         FOR UPDATE`,
        [invitationId, user.email]
      );

      if (invitationResult.rows.length === 0) {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(404).json({
          status: "error",
          message: "Invitation not found for your account."
        });
      }

      const invitation = invitationResult.rows[0];

      if (invitation.status !== "pending") {
        await client.query("ROLLBACK");
        transactionStarted = false;

        return res.status(409).json({
          status: "error",
          message: "This invitation is no longer pending."
        });
      }

      if (new Date(invitation.expires_at) <= new Date()) {
        await client.query(
          `UPDATE group_invitations
           SET status = 'expired'
           WHERE id = $1`,
          [invitationId]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(410).json({
          status: "error",
          message: "This invitation has expired."
        });
      }

      await client.query(
        `INSERT INTO group_members (group_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [invitation.group_id, user.id]
      );

      await client.query(
        `UPDATE group_invitations
         SET status = 'accepted',
             accepted_by = $1,
             accepted_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [user.id, invitationId]
      );

      const groupResult = await client.query(
        `SELECT id, name
         FROM groups
         WHERE id = $1`,
        [invitation.group_id]
      );

      await client.query("COMMIT");
      transactionStarted = false;

      return res.status(200).json({
        status: "success",
        message: "You have successfully joined the group!",
        group: groupResult.rows[0]
      });

    } catch (error) {
      if (transactionStarted) {
        await client.query("ROLLBACK");
      }

      console.error("Accept invitation error:", error.message);

      return res.status(500).json({
        status: "error",
        message: "Unable to accept invitation."
      });

    } finally {
      client.release();
    }
  }
);

// ==========================================
// CANCEL GROUP INVITATION
// DELETE /api/groups/:id/invitations/:invitationId
// ==========================================

router.delete(
  "/:id/invitations/:invitationId",
  async (req, res) => {
    try {
      const groupId = Number(req.params.id);
      const invitationId = Number(req.params.invitationId);

      if (
        !Number.isInteger(groupId) || groupId <= 0 ||
        !Number.isInteger(invitationId) || invitationId <= 0
      ) {
        return res.status(400).json({
          status: "error",
          message: "Invalid group or invitation ID."
        });
      }

      const owner = await isGroupOwner(groupId, req.user.userId);

      if (!owner) {
        return res.status(403).json({
          status: "error",
          message: "Only the group creator can cancel invitations."
        });
      }

      const result = await pool.query(
        `UPDATE group_invitations
         SET status = 'cancelled'
         WHERE id = $1
         AND group_id = $2
         AND status = 'pending'
         RETURNING id`,
        [invitationId, groupId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          status: "error",
          message: "Pending invitation not found."
        });
      }

      return res.status(200).json({
        status: "success",
        message: "Invitation cancelled successfully."
      });

    } catch (error) {
      console.error("Cancel invitation error:", error.message);

      return res.status(500).json({
        status: "error",
        message: "Unable to cancel invitation."
      });
    }
  }
);

// ==========================================
// GET GROUP MEMBERS
// GET /api/groups/:id/members
// ==========================================

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
      `SELECT
        u.id,
        u.name,
        u.email,
        gm.joined_at
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

// ==========================================
// REMOVE GROUP MEMBER
// DELETE /api/groups/:id/members/:userId
// ==========================================

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

    const owner = await isGroupOwner(groupId, req.user.userId);

    if (!owner) {
      return res.status(403).json({
        status: "error",
        message: "Only the group creator can remove members."
      });
    }

    if (memberId === req.user.userId) {
      return res.status(400).json({
        status: "error",
        message: "The group creator cannot be removed."
      });
    }

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

// ==========================================
// READ ONE GROUP
// GET /api/groups/:id
// ==========================================

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

// ==========================================
// UPDATE GROUP
// PUT /api/groups/:id
// ==========================================

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

// ==========================================
// DELETE GROUP
// DELETE /api/groups/:id
// ==========================================

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

// ==========================================
// EXPORT ROUTER
// ==========================================

module.exports = router;
