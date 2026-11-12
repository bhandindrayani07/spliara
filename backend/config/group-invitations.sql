
BEGIN;

-- 1. Store group invitations
CREATE TABLE IF NOT EXISTS group_invitations (
    id SERIAL PRIMARY KEY,

    group_id INTEGER NOT NULL
        REFERENCES groups(id) ON DELETE CASCADE,

    invited_by INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,

    invited_email VARCHAR(255) NOT NULL,

    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),

    accepted_by INTEGER
        REFERENCES users(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    expires_at TIMESTAMPTZ
        DEFAULT (CURRENT_TIMESTAMP + INTERVAL '7 days'),

    accepted_at TIMESTAMPTZ
);

-- 2. Prevent duplicate pending invitations
CREATE UNIQUE INDEX IF NOT EXISTS
idx_unique_pending_group_invitation
ON group_invitations (group_id, LOWER(invited_email))
WHERE status = 'pending';

-- 3. Find invitations by email
CREATE INDEX IF NOT EXISTS
idx_group_invitations_email
ON group_invitations (LOWER(invited_email), status);

-- 4. Find invitations for a group
CREATE INDEX IF NOT EXISTS
idx_group_invitations_group
ON group_invitations (group_id);

COMMIT;
