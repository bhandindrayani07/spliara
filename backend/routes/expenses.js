
const express = require("express");
const router = express.Router();

const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

router.use(authMiddleware);

// ==========================================
// MONEY HELPERS
// ==========================================

function toPaise(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount < 0) {
        return null;
    }

    return Math.round(amount * 100);
}

function fromPaise(value) {
    return Number((value / 100).toFixed(2));
}

// ==========================================
// CREATE EXPENSE
// ==========================================

router.post("/", async (req, res) => {
    try {
        const { groupId, description, amount } = req.body;

        if (
            !groupId ||
            typeof description !== "string" ||
            !description.trim() ||
            amount === undefined
        ) {
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

        const membership = await pool.query(
            `SELECT 1
             FROM group_members
             WHERE group_id = $1 AND user_id = $2`,
            [Number(groupId), req.user.userId]
        );

        if (membership.rows.length === 0) {
            return res.status(403).json({
                status: "error",
                message: "You are not a member of this group."
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

// ==========================================
// GET ALL EXPENSES
// ==========================================

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

        if (groupId !== undefined && !/^[1-9]\d*$/.test(groupId)) {
            return res.status(400).json({
                status: "error",
                message: "Invalid group ID filter."
            });
        }

        const parsedMin =
            minAmount === undefined ? null : Number(minAmount);

        const parsedMax =
            maxAmount === undefined ? null : Number(maxAmount);

        if (
            (parsedMin !== null &&
                (!Number.isFinite(parsedMin) || parsedMin < 0)) ||
            (parsedMax !== null &&
                (!Number.isFinite(parsedMax) || parsedMax < 0)) ||
            (parsedMin !== null &&
                parsedMax !== null &&
                parsedMin > parsedMax)
        ) {
            return res.status(400).json({
                status: "error",
                message: "Invalid amount range."
            });
        }

        const conditions = [
            `EXISTS (
                SELECT 1
                FROM group_members gm
                WHERE gm.group_id = e.group_id
                AND gm.user_id = $1
            )`
        ];

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
             WHERE ${whereClause}`,
            values
        );

        const total = countResult.rows[0].total;
        const totalPages = Math.ceil(total / pageSize);
        const offset = (pageNumber - 1) * pageSize;

        const listValues = [...values, pageSize, offset];

        const result = await pool.query(
            `SELECT
                e.*,
                u.name AS payer_name,
                g.name AS group_name
             FROM expenses e
             JOIN groups g ON e.group_id = g.id
             JOIN users u ON u.id = e.paid_by
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

// ==========================================
// GET ONE EXPENSE WITH SPLITS
// ==========================================

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
            `SELECT
                e.*,
                u.name AS payer_name,
                g.name AS group_name
             FROM expenses e
             JOIN groups g ON e.group_id = g.id
             JOIN users u ON u.id = e.paid_by
             WHERE e.id = $1
             AND EXISTS (
                SELECT 1
                FROM group_members gm
                WHERE gm.group_id = e.group_id
                AND gm.user_id = $2
             )`,
            [expenseId, req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Expense not found."
            });
        }

        const splitsResult = await pool.query(
            `SELECT
                es.user_id AS "userId",
                u.name AS "userName",
                es.share_amount AS "shareAmount",
                es.paid_amount AS "paidAmount"
             FROM expense_splits es
             JOIN users u ON u.id = es.user_id
             WHERE es.expense_id = $1
             ORDER BY es.user_id`,
            [expenseId]
        );

        return res.status(200).json({
            status: "success",
            debugVersion: "expense-splits-test-1",
            expense: {
                ...result.rows[0],
                splits: splitsResult.rows
            }
        });

    } catch (error) {
        console.error("Get expense error:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Failed to retrieve expense."
        });
    }
});

// ==========================================
// UPDATE EXPENSE SAFELY
// ==========================================

router.put("/:id", async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

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

        await client.query("BEGIN");
        transactionStarted = true;

        const existing = await client.query(
            `SELECT e.*, g.created_by
             FROM expenses e
             JOIN groups g ON e.group_id = g.id
             WHERE e.id = $1
             AND EXISTS (
                SELECT 1
                FROM group_members gm
                WHERE gm.group_id = e.group_id
                AND gm.user_id = $2
             )
             FOR UPDATE OF e`,
            [expenseId, req.user.userId]
        );

        if (existing.rows.length === 0) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(404).json({
                status: "error",
                message: "Expense not found."
            });
        }

        const expense = existing.rows[0];
        const userId = Number(req.user.userId);

        const isCreator =
            Number(expense.created_by) === userId;

        const isPayer =
            Number(expense.paid_by) === userId;

        if (!isCreator && !isPayer) {
            await client.query("ROLLBACK");
            transactionStarted = false;

            return res.status(403).json({
                status: "error",
                message: "You cannot edit this expense."
            });
        }

        const newDescription =
            description === undefined
                ? expense.description
                : description.trim();

        const newAmount =
            amount === undefined
                ? Number(expense.amount)
                : Number(amount);

        const amountChanged =
            amount !== undefined &&
            toPaise(newAmount) !== toPaise(expense.amount);

        if (amountChanged) {
            const splitsResult = await client.query(
                `SELECT id, user_id, share_amount, paid_amount
                 FROM expense_splits
                 WHERE expense_id = $1
                 ORDER BY id
                 FOR UPDATE`,
                [expenseId]
            );

            const splits = splitsResult.rows;

            if (splits.length > 0) {
                const hasRecordedPayments = splits.some(split => {
                    return Number(split.paid_amount) > 0;
                });

                if (hasRecordedPayments) {
                    await client.query("ROLLBACK");
                    transactionStarted = false;

                    return res.status(409).json({
                        status: "error",
                        message: "This expense has recorded payments. Its amount cannot be changed until those payments are handled."
                    });
                }

                const oldTotalPaise = splits.reduce(
                    (sum, split) => {
                        return sum + BigInt(
                            toPaise(split.share_amount)
                        );
                    },
                    0n
                );

                if (oldTotalPaise <= 0n) {
                    await client.query("ROLLBACK");
                    transactionStarted = false;

                    return res.status(409).json({
                        status: "error",
                        message: "The existing splits cannot be recalculated safely."
                    });
                }

                const newTotalPaise = BigInt(toPaise(newAmount));

                const recalculated = splits.map(split => {
                    const oldSharePaise = BigInt(
                        toPaise(split.share_amount)
                    );

                    const newSharePaise =
                        (newTotalPaise * oldSharePaise) /
                        oldTotalPaise;

                    return {
                        id: split.id,
                        sharePaise: newSharePaise
                    };
                });

                const allocatedPaise = recalculated.reduce(
                    (sum, split) => sum + split.sharePaise,
                    0n
                );

                let remainder =
                    newTotalPaise - allocatedPaise;

                for (let i = 0; remainder > 0n; i++) {
                    recalculated[i].sharePaise += 1n;
                    remainder -= 1n;
                }

                for (const split of recalculated) {
                    await client.query(
                        `UPDATE expense_splits
                         SET share_amount = $1
                         WHERE id = $2`,
                        [
                            fromPaise(Number(split.sharePaise)),
                            split.id
                        ]
                    );
                }
            }
        }

        const updated = await client.query(
            `UPDATE expenses
             SET description = $1, amount = $2
             WHERE id = $3
             RETURNING *`,
            [newDescription, newAmount, expenseId]
        );

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(200).json({
            status: "success",
            message: amountChanged
                ? "Expense and member splits updated successfully!"
                : "Expense updated successfully!",
            expense: updated.rows[0]
        });

    } catch (error) {
        if (transactionStarted) {
            await client.query("ROLLBACK");
        }

        console.error("Update expense error:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Failed to update expense."
        });

    } finally {
        client.release();
    }
});

// ==========================================
// DELETE EXPENSE
// ==========================================

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
             AND (
                g.created_by = $2
                OR e.paid_by = $2
             )
             AND EXISTS (
                SELECT 1
                FROM group_members gm
                WHERE gm.group_id = e.group_id
                AND gm.user_id = $2
             )
             RETURNING e.id, e.description`,
            [expenseId, req.user.userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                status: "error",
                message: "Expense not found or you cannot delete it."
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
