CREATE TABLE registration_tokens (
    token_hash TEXT NOT NULL PRIMARY KEY,
    user_id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
