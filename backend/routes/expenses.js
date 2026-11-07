
const express = require("express");
const router = express.Router();

const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

// All expense routes require authentication
router.use(authMiddleware);

// CREATE EXPENSE
router.post("/", async (req, res) => {
  try {
    const { groupId, description, amount } = req.body;

    if (!groupId || !description || amount === undefined) {
      return res.status(400).json({
        status: "error",
        message: "Group ID, description, and amount are required."
      });
    }

    if (!Number.isInteger(Number(groupId)) || Number(groupId) <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid group ID."
      });
    }

    const parsedAmount = Number(amount);

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Amount must be a positive number."
      });
    }

    const groupResult = await pool.query(
      "SELECT id FROM groups WHERE id = $1 AND created_by = $2",
      [Number(groupId), req.user.userId]
    );

    if (groupResult.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Group not found."
      });
    }

    const result = await pool.query(
      `INSERT INTO expenses (group_id, paid_by, description, amount)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        Number(groupId),
        req.user.userId,
        description.trim(),
        parsedAmount
      ]
    );

    return res.status(201).json({
      status: "success",
      message: "Expense created successfully!",
      expense: result.rows[0]
    });
  } catch (error) {
    console.error("Create expense error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to create expense."
    });
  }
});

// GET ALL EXPENSES WITH SEARCH, FILTERS AND PAGINATION
router.get("/", async (req, res) => {
  try {
    const {
      q,
      groupId,
      minAmount,
      maxAmount,
      page = "1",
      limit = "10"
    } = req.query;

    const pageNumber = Number(page);
    const pageSize = Number(limit);

    if (
      !Number.isInteger(pageNumber) ||
      !Number.isInteger(pageSize) ||
      pageNumber < 1 ||
      pageSize < 1 ||
      pageSize > 100
    ) {
      return res.status(400).json({
        status: "error",
        message: "Page must be positive and limit must be between 1 and 100."
      });
    }

    if (
      groupId !== undefined &&
      (!/^[1-9]\d*$/.test(groupId))
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid group ID filter."
      });
    }

    const parsedMin = minAmount === undefined ? null : Number(minAmount);
    const parsedMax = maxAmount === undefined ? null : Number(maxAmount);

    if (
      (parsedMin !== null && (!Number.isFinite(parsedMin) || parsedMin < 0)) ||
      (parsedMax !== null && (!Number.isFinite(parsedMax) || parsedMax < 0)) ||
      (parsedMin !== null && parsedMax !== null && parsedMin > parsedMax)
    ) {
      return res.status(400).json({
        status: "error",
        message: "Invalid amount range."
      });
    }

    const conditions = ["g.created_by = $1"];
    const values = [req.user.userId];

    if (q && q.trim()) {
      values.push(`%${q.trim()}%`);
      conditions.push(`e.description ILIKE $${values.length}`);
    }

    if (groupId !== undefined) {
      values.push(Number(groupId));
      conditions.push(`e.group_id = $${values.length}`);
    }

    if (parsedMin !== null) {
      values.push(parsedMin);
      conditions.push(`e.amount >= $${values.length}`);
    }

    if (parsedMax !== null) {
      values.push(parsedMax);
      conditions.push(`e.amount <= $${values.length}`);
    }

    const whereClause = conditions.join(" AND ");

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM expenses e
       JOIN groups g ON e.group_id = g.id
       WHERE ${whereClause}`,
      values
    );

    const total = countResult.rows[0].total;
    const totalPages = Math.ceil(total / pageSize);
    const offset = (pageNumber - 1) * pageSize;

    const listValues = [...values, pageSize, offset];

    const result = await pool.query(
      `SELECT e.*
       FROM expenses e
       JOIN groups g ON e.group_id = g.id
       WHERE ${whereClause}
       ORDER BY e.created_at DESC, e.id DESC
       LIMIT $${listValues.length - 1}
       OFFSET $${listValues.length}`,
      listValues
    );

    return res.status(200).json({
      status: "success",
      count: result.rows.length,
      pagination: {
        total,
        page: pageNumber,
        limit: pageSize,
        totalPages
      },
      filters: {
        q: q || null,
        groupId: groupId || null,
        minAmount: parsedMin,
        maxAmount: parsedMax
      },
      expenses: result.rows
    });
  } catch (error) {
    console.error("Get expenses error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve expenses."
    });
  }
});

// GET ONE EXPENSE
router.get("/:id", async (req, res) => {
  try {
    const expenseId = Number(req.params.id);

    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid expense ID."
      });
    }

    const result = await pool.query(
      `SELECT e.*
       FROM expenses e
       JOIN groups g ON e.group_id = g.id
       WHERE e.id = $1 AND g.created_by = $2`,
      [expenseId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Expense not found."
      });
    }

    return res.status(200).json({
      status: "success",
      expense: result.rows[0]
    });
  } catch (error) {
    console.error("Get expense error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to retrieve expense."
    });
  }
});

// UPDATE EXPENSE
router.put("/:id", async (req, res) => {
  try {
    const expenseId = Number(req.params.id);
    const { description, amount } = req.body;

    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid expense ID."
      });
    }

    if (
      (description !== undefined &&
        (typeof description !== "string" || !description.trim())) ||
      (amount !== undefined &&
        (!Number.isFinite(Number(amount)) || Number(amount) <= 0))
    ) {
      return res.status(400).json({
        status: "error",
        message: "Provide a valid description or positive amount."
      });
    }

    if (description === undefined && amount === undefined) {
      return res.status(400).json({
        status: "error",
        message: "Provide a description or amount to update."
      });
    }

    const existing = await pool.query(
      `SELECT e.*
       FROM expenses e
       JOIN groups g ON e.group_id = g.id
       WHERE e.id = $1 AND g.created_by = $2`,
      [expenseId, req.user.userId]
    );

    if (existing.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Expense not found."
      });
    }

    const newDescription =
      description === undefined
        ? existing.rows[0].description
        : description.trim();

    const newAmount =
      amount === undefined
        ? existing.rows[0].amount
        : Number(amount);

    const result = await pool.query(
      `UPDATE expenses
       SET description = $1, amount = $2
       WHERE id = $3
       RETURNING *`,
      [newDescription, newAmount, expenseId]
    );

    return res.status(200).json({
      status: "success",
      message: "Expense updated successfully!",
      expense: result.rows[0]
    });
  } catch (error) {
    console.error("Update expense error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to update expense."
    });
  }
});

// DELETE EXPENSE
router.delete("/:id", async (req, res) => {
  try {
    const expenseId = Number(req.params.id);

    if (!Number.isInteger(expenseId) || expenseId <= 0) {
      return res.status(400).json({
        status: "error",
        message: "Invalid expense ID."
      });
    }

    const result = await pool.query(
      `DELETE FROM expenses e
       USING groups g
       WHERE e.group_id = g.id
         AND e.id = $1
         AND g.created_by = $2
       RETURNING e.id, e.description`,
      [expenseId, req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: "error",
        message: "Expense not found."
      });
    }

    return res.status(200).json({
      status: "success",
      message: "Expense deleted successfully!",
      expense: result.rows[0]
    });
  } catch (error) {
    console.error("Delete expense error:", error.message);
    return res.status(500).json({
      status: "error",
      message: "Failed to delete expense."
    });
  }
});

module.exports = router;
