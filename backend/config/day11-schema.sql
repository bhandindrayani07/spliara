
BEGIN;

-- 1. Group memberships
CREATE TABLE IF NOT EXISTS group_members (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT group_members_group_user_unique
        UNIQUE (group_id, user_id)
);

-- 2. Expense splits
CREATE TABLE IF NOT EXISTS expense_splits (
    id SERIAL PRIMARY KEY,
    expense_id INTEGER NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    share_amount NUMERIC(10,2) NOT NULL CHECK (share_amount >= 0),
    paid_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    CONSTRAINT expense_splits_expense_user_unique
        UNIQUE (expense_id, user_id)
);

-- 3. Settlements
CREATE TABLE IF NOT EXISTS settlements (
    id SERIAL PRIMARY KEY,
    group_id INTEGER NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
    paid_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    received_by INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    settlement_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT settlements_different_users
        CHECK (paid_by <> received_by)
);

-- 4. Useful indexes
CREATE INDEX IF NOT EXISTS idx_group_members_user
ON group_members(user_id);

CREATE INDEX IF NOT EXISTS idx_expense_splits_user
ON expense_splits(user_id);

CREATE INDEX IF NOT EXISTS idx_settlements_group
ON settlements(group_id);

-- 5. Add existing group creators as members
INSERT INTO group_members (group_id, user_id)
SELECT id, created_by
FROM groups
ON CONFLICT (group_id, user_id) DO NOTHING;

-- 6. Add existing expense payers as group members
INSERT INTO group_members (group_id, user_id)
SELECT DISTINCT group_id, paid_by
FROM expenses
ON CONFLICT (group_id, user_id) DO NOTHING;

COMMIT;
