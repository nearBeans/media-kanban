CREATE TABLE recovery_codes (
    id TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    salt TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    consumed_at TEXT,
    reserved_by TEXT,
    reserved_until TEXT
);

CREATE INDEX recovery_codes_user_id_idx ON recovery_codes(user_id);

CREATE TABLE recovery_challenges (
    context_hash TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    recovery_code_id TEXT NOT NULL UNIQUE
        REFERENCES recovery_codes(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
);

CREATE INDEX recovery_challenges_user_id_idx ON recovery_challenges(user_id);
