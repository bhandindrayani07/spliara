
const express = require("express");
const pool = require("../config/db");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

router.use(authMiddleware);

// ==========================================
// MONEY HELPERS
// ==========================================

function toPaise(value) {
    const amount = Number(value);

    if (!Number.isFinite(amount) || amount <= 0) {
        return null;
    }

    return Math.round(amount * 100);
}

function parsePaise(value) {
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
// GROUP MEMBERSHIP HELPER
// ==========================================

async function isGroupMember(groupId, userId, db = pool) {
    const result = await db.query(
        `SELECT 1
         FROM group_members
         WHERE group_id = $1 AND user_id = $2`,
        [groupId, userId]
    );

    return result.rows.length > 0;
}

// ==========================================
// CALCULATE EXPENSE SPLITS
// ==========================================

function calculateSplits(totalPaise, splitType, splits) {
    if (!Array.isArray(splits) || splits.length === 0) {
        throw new Error("At least one member must be included.");
    }

    const userIds = splits.map(item => Number(item.userId));

    if (
        userIds.some(id => !Number.isInteger(id) || id <= 0) ||
        new Set(userIds).size !== userIds.length
    ) {
        throw new Error("Invalid or duplicate member IDs.");
    }

    // EQUAL SPLIT
    if (splitType === "equal") {
        const base = Math.floor(totalPaise / splits.length);
        let remainder = totalPaise % splits.length;

        return splits.map(item => {
            const share = base + (remainder > 0 ? 1 : 0);
            remainder = Math.max(0, remainder - 1);

            return {
                userId: Number(item.userId),
                sharePaise: share
            };
        });
    }

    // EXACT SPLIT
    if (splitType === "exact") {
        const result = splits.map(item => ({
            userId: Number(item.userId),
            sharePaise: parsePaise(item.amount)
        }));

        if (result.some(item => item.sharePaise === null)) {
            throw new Error(
                "Exact shares must be valid non-negative amounts."
            );
        }

        const totalShares = result.reduce(
            (sum, item) => sum + item.sharePaise,
            0
        );

        if (totalShares !== totalPaise) {
            throw new Error(
                "Exact shares must equal the expense amount."
            );
        }

        return result;
    }

    // PERCENTAGE SPLIT
    if (splitType === "percentage") {
        const percentages = splits.map(item => Number(item.percentage));

        if (
            percentages.some(value =>
                !Number.isFinite(value) || value < 0
            )
        ) {
            throw new Error(
                "Percentages must be valid non-negative numbers."
            );
        }

        const totalPercentage = percentages.reduce(
            (sum, value) => sum + value,
            0
        );

        if (
            Math.abs(totalPercentage - 100) > 0.000001 ||
            percentages.every(value => value === 0)
        ) {
            throw new Error("Percentages must add up to 100.");
        }

        let allocated = 0;

        return splits.map((item, index) => {
            let share;

            if (index === splits.length - 1) {
                share = totalPaise - allocated;
            } else {
                share = Math.floor(
                    totalPaise * percentages[index] / 100
                );

                allocated += share;
            }

            return {
                userId: Number(item.userId),
                sharePaise: share
            };
        });
    }

    throw new Error(
        "Split type must be equal, exact or percentage."
    );
}

// ==========================================
// LOAD GROUP FINANCIAL DATA
// ==========================================

async function loadGroupFinancialData(groupId) {
    const [
        membersResult,
        expensesResult,
        splitsResult,
        settlementsResult
    ] = await Promise.all([
        pool.query(
            `SELECT u.id, u.name, u.email
             FROM group_members gm
             JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = $1`,
            [groupId]
        ),

        pool.query(
            `SELECT e.id, e.paid_by, e.amount
             FROM expenses e
             WHERE e.group_id = $1
             AND EXISTS (
                 SELECT 1
                 FROM expense_splits es
                 WHERE es.expense_id = e.id
             )`,
            [groupId]
        ),

        pool.query(
            `SELECT es.expense_id, es.user_id, es.share_amount
             FROM expense_splits es
             JOIN expenses e ON e.id = es.expense_id
             WHERE e.group_id = $1`,
            [groupId]
        ),

        pool.query(
            `SELECT paid_by, received_by, amount
             FROM settlements
             WHERE group_id = $1`,
            [groupId]
        )
    ]);

    const balances = new Map();

    // Initialize all members with zero balance.
    for (const member of membersResult.rows) {
        balances.set(member.id, {
            userId: member.id,
            name: member.name,
            email: member.email,
            balancePaise: 0
        });
    }

    // Credit the person who paid for each expense.
    for (const expense of expensesResult.rows) {
        const payer = balances.get(expense.paid_by);
        const amountPaise = parsePaise(expense.amount);

        if (payer && amountPaise !== null) {
            payer.balancePaise += amountPaise;
        }
    }

    // Deduct each member's expense share.
    for (const split of splitsResult.rows) {
        const participant = balances.get(split.user_id);
        const sharePaise = parsePaise(split.share_amount);

        if (participant && sharePaise !== null) {
            participant.balancePaise -= sharePaise;
        }
    }

    // Apply recorded settlements.
    for (const settlement of settlementsResult.rows) {
        const payer = balances.get(settlement.paid_by);
        const receiver = balances.get(settlement.received_by);
        const amountPaise = parsePaise(settlement.amount);

        if (amountPaise === null) continue;

        if (payer) {
            payer.balancePaise += amountPaise;
        }

        if (receiver) {
            receiver.balancePaise -= amountPaise;
        }
    }

    return balances;
}

// ==========================================
// CREATE EXPENSE WITH SPLITS
// POST /api/finance/groups/:groupId/expenses
// ==========================================

router.post("/groups/:groupId/expenses", async (req, res) => {
    const client = await pool.connect();
    let transactionStarted = false;

    try {
        const groupId = Number(req.params.groupId);
        const paidBy = Number(req.user.userId);

        const { description, amount, splitType, splits } = req.body;

        const totalPaise = toPaise(amount);

        if (
            !Number.isInteger(groupId) ||
            groupId <= 0 ||
            typeof description !== "string" ||
            !description.trim() ||
            !totalPaise
        ) {
            return res.status(400).json({
                status: "error",
                message: "Please provide a valid group, description and amount."
            });
        }

        await client.query("BEGIN");
        transactionStarted = true;

        const payerIsMember = await isGroupMember(
            groupId,
            paidBy,
            client
        );

        if (!payerIsMember) {
            throw new Error(
                "You must be a group member to add an expense."
            );
        }

        const calculatedSplits = calculateSplits(
            totalPaise,
            splitType,
            splits
        );

        for (const split of calculatedSplits) {
            const memberExists = await isGroupMember(
                groupId,
                split.userId,
                client
            );

            if (!memberExists) {
                throw new Error(
                    `User ${split.userId} is not a member of this group.`
                );
            }
        }

        const expenseResult = await client.query(
            `INSERT INTO expenses
             (group_id, paid_by, description, amount)
             VALUES ($1, $2, $3, $4)
             RETURNING *`,
            [
                groupId,
                paidBy,
                description.trim(),
                fromPaise(totalPaise)
            ]
        );

        const expense = expenseResult.rows[0];

        for (const split of calculatedSplits) {
            await client.query(
                `INSERT INTO expense_splits
                 (expense_id, user_id, share_amount, paid_amount)
                 VALUES ($1, $2, $3, 0)`,
                [
                    expense.id,
                    split.userId,
                    fromPaise(split.sharePaise)
                ]
            );
        }

        await client.query("COMMIT");
        transactionStarted = false;

        return res.status(201).json({
            status: "success",
            message: "Expense and splits created successfully.",
            expense,
            splits: calculatedSplits.map(item => ({
                userId: item.userId,
                shareAmount: fromPaise(item.sharePaise)
            }))
        });

    } catch (error) {
        if (transactionStarted) {
            await client.query("ROLLBACK");
        }

        console.error("Create split expense error:", error.message);

        return res.status(400).json({
            status: "error",
            message: error.message || "Unable to create expense."
        });

    } finally {
        client.release();
    }
});

// ==========================================
// GET MEMBER BALANCES
// GET /api/finance/groups/:groupId/balances
// ==========================================

router.get("/groups/:groupId/balances", async (req, res) => {
    try {
        const groupId = Number(req.params.groupId);
        const userId = Number(req.user.userId);

        if (!Number.isInteger(groupId) || groupId <= 0) {
            return res.status(400).json({
                status: "error",
                message: "Invalid group ID."
            });
        }

        if (!(await isGroupMember(groupId, userId))) {
            return res.status(403).json({
                status: "error",
                message: "You are not a member of this group."
            });
        }

        const balances = await loadGroupFinancialData(groupId);

        const result = Array.from(balances.values()).map(member => ({
            userId: member.userId,
            name: member.name,
            email: member.email,
            balance: fromPaise(member.balancePaise),
            status:
                member.balancePaise > 0
                    ? "gets back"
                    : member.balancePaise < 0
                        ? "owes"
                        : "settled"
        }));

        return res.status(200).json({
            status: "success",
            balances: result
        });

    } catch (error) {
        console.error("Balance calculation error:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to calculate balances."
        });
    }
});

// ==========================================
// SIMPLIFY DEBTS USING GREEDY ALGORITHM
// GET /api/finance/groups/:groupId/simplified-debts
// ==========================================

router.get(
    "/groups/:groupId/simplified-debts",
    async (req, res) => {
        try {
            const groupId = Number(req.params.groupId);
            const userId = Number(req.user.userId);

            if (!Number.isInteger(groupId) || groupId <= 0) {
                return res.status(400).json({
                    status: "error",
                    message: "Invalid group ID."
                });
            }

            if (!(await isGroupMember(groupId, userId))) {
                return res.status(403).json({
                    status: "error",
                    message: "You are not a member of this group."
                });
            }

            const balances = await loadGroupFinancialData(groupId);

            const creditors = [];
            const debtors = [];

            for (const member of balances.values()) {
                if (member.balancePaise > 0) {
                    creditors.push({ ...member });
                } else if (member.balancePaise < 0) {
                    debtors.push({
                        ...member,
                        balancePaise: Math.abs(member.balancePaise)
                    });
                }
            }

            creditors.sort(
                (a, b) => b.balancePaise - a.balancePaise
            );

            debtors.sort(
                (a, b) => b.balancePaise - a.balancePaise
            );

            const transactions = [];

            let i = 0;
            let j = 0;

            while (i < debtors.length && j < creditors.length) {
                const amountPaise = Math.min(
                    debtors[i].balancePaise,
                    creditors[j].balancePaise
                );

                if (amountPaise > 0) {
                    transactions.push({
                        from: {
                            userId: debtors[i].userId,
                            name: debtors[i].name
                        },
                        to: {
                            userId: creditors[j].userId,
                            name: creditors[j].name
                        },
                        amount: fromPaise(amountPaise)
                    });
                }

                debtors[i].balancePaise -= amountPaise;
                creditors[j].balancePaise -= amountPaise;

                if (debtors[i].balancePaise === 0) {
                    i++;
                }

                if (creditors[j].balancePaise === 0) {
                    j++;
                }
            }

            return res.status(200).json({
                status: "success",
                algorithm: "Greedy Debt Simplification",
                transactionCount: transactions.length,
                transactions
            });

        } catch (error) {
            console.error("Debt simplification error:", error.message);

            return res.status(500).json({
                status: "error",
                message: "Unable to simplify debts."
            });
        }
    }
);

// ==========================================
// RECORD A SETTLEMENT
// POST /api/finance/groups/:groupId/settlements
// ==========================================

router.post(
    "/groups/:groupId/settlements",
    async (req, res) => {
        try {
            const groupId = Number(req.params.groupId);
            const paidBy = Number(req.user.userId);

            const { receivedBy, amount } = req.body;

            const receiverId = Number(receivedBy);
            const amountPaise = toPaise(amount);

            if (
                !Number.isInteger(groupId) ||
                groupId <= 0 ||
                !Number.isInteger(receiverId) ||
                receiverId <= 0 ||
                !amountPaise ||
                paidBy === receiverId
            ) {
                return res.status(400).json({
                    status: "error",
                    message: "Please provide valid settlement details."
                });
            }

            const payerIsMember = await isGroupMember(
                groupId,
                paidBy
            );

            const receiverIsMember = await isGroupMember(
                groupId,
                receiverId
            );

            if (!payerIsMember || !receiverIsMember) {
                return res.status(403).json({
                    status: "error",
                    message: "Both users must belong to this group."
                });
            }

            const result = await pool.query(
                `INSERT INTO settlements
                 (group_id, paid_by, received_by, amount)
                 VALUES ($1, $2, $3, $4)
                 RETURNING *`,
                [
                    groupId,
                    paidBy,
                    receiverId,
                    fromPaise(amountPaise)
                ]
            );

            return res.status(201).json({
                status: "success",
                message: "Settlement recorded successfully.",
                settlement: result.rows[0]
            });

        } catch (error) {
            console.error("Settlement error:", error.message);

            return res.status(500).json({
                status: "error",
                message: "Unable to record settlement."
            });
        }
    }
);

// ==========================================
// GET SETTLEMENT HISTORY
// GET /api/finance/settlements
// GET /api/finance/settlements?groupId=4
// ==========================================

router.get("/settlements", async (req, res) => {
    try {
        const userId = Number(req.user.userId);
        const groupId = req.query.groupId
            ? Number(req.query.groupId)
            : null;

        if (
            groupId !== null &&
            (!Number.isInteger(groupId) || groupId <= 0)
        ) {
            return res.status(400).json({
                status: "error",
                message: "Invalid group ID."
            });
        }

        const queryParams = [userId];
        let groupFilter = "";

        if (groupId !== null) {
            if (!(await isGroupMember(groupId, userId))) {
                return res.status(403).json({
                    status: "error",
                    message: "You are not a member of this group."
                });
            }

            queryParams.push(groupId);
            groupFilter = "AND s.group_id = $2";
        }

        const result = await pool.query(
            `SELECT
                s.id,
                s.group_id AS "groupId",
                g.name AS "groupName",
                payer.id AS "paidByUserId",
                payer.name AS "paidByName",
                receiver.id AS "receivedByUserId",
                receiver.name AS "receivedByName",
                s.amount,
                s.settlement_date AS "settlementDate",
                s.created_at AS "createdAt"
             FROM settlements s
             JOIN groups g ON g.id = s.group_id
             JOIN users payer ON payer.id = s.paid_by
             JOIN users receiver ON receiver.id = s.received_by
             WHERE EXISTS (
                SELECT 1
                FROM group_members gm
                WHERE gm.group_id = s.group_id
                AND gm.user_id = $1
             )
             ${groupFilter}
             ORDER BY s.created_at DESC, s.id DESC`,
            queryParams
        );

        return res.status(200).json({
            status: "success",
            count: result.rows.length,
            settlements: result.rows
        });

    } catch (error) {
        console.error("Settlement history error:", error.message);

        return res.status(500).json({
            status: "error",
            message: "Unable to load settlement history."
        });
    }
});

module.exports = router;
