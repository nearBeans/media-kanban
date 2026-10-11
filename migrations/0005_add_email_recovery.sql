ALTER TABLE recovery_codes ADD COLUMN expires_at TEXT;

CREATE TABLE recovery_emails (
    user_id TEXT NOT NULL PRIMARY KEY REFERENCES "user"(id) ON DELETE CASCADE,
    email TEXT COLLATE NOCASE,
    pending_email TEXT COLLATE NOCASE,
    verified_at TEXT,
    verification_token_hash TEXT,
    verification_expires_at TEXT,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX recovery_emails_email_unique
    ON recovery_emails(email COLLATE NOCASE) WHERE email IS NOT NULL;

CREATE UNIQUE INDEX recovery_emails_pending_email_unique
    ON recovery_emails(pending_email COLLATE NOCASE) WHERE pending_email IS NOT NULL;

CREATE TABLE recovery_email_deliveries (
    id TEXT NOT NULL PRIMARY KEY,
    email TEXT NOT NULL,
    purpose TEXT NOT NULL CHECK (purpose IN ('verification', 'recovery')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX recovery_email_deliveries_email_created_idx
    ON recovery_email_deliveries(email, purpose, created_at);
