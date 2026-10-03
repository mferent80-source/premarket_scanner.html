CREATE TABLE IF NOT EXISTS cloud_sessions (hash TEXT PRIMARY KEY, subject TEXT NOT NULL, email TEXT NOT NULL, expires INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS cloud_session_expiry ON cloud_sessions(expires);
CREATE TABLE IF NOT EXISTS cloud_challenges (nonce TEXT PRIMARY KEY, expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS cloud_records (subject TEXT NOT NULL, key TEXT NOT NULL, revision INTEGER NOT NULL, packet TEXT NOT NULL, updated INTEGER NOT NULL, PRIMARY KEY(subject,key));
CREATE TABLE IF NOT EXISTS cloud_limits (key TEXT PRIMARY KEY, bucket INTEGER NOT NULL, count INTEGER NOT NULL);
