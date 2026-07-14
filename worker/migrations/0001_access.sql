-- CordalSur access control schema.
-- Timestamps are Unix seconds in UTC. Admin inputs are interpreted in
-- America/Santiago by the Worker before they are persisted.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS stays (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  guest_pin_digest TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0, 1)),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS idx_stays_window
  ON stays (starts_at, ends_at);

CREATE INDEX IF NOT EXISTS idx_stays_active
  ON stays (enabled, starts_at, ends_at);

-- Enforce the no-overlap invariant inside SQLite as well as in the API. This
-- closes the race between two nearly simultaneous administrator requests.
CREATE TRIGGER IF NOT EXISTS stays_no_overlap_insert
BEFORE INSERT ON stays
WHEN EXISTS (
  SELECT 1 FROM stays
  WHERE starts_at < NEW.ends_at AND ends_at > NEW.starts_at
)
BEGIN
  SELECT RAISE(ABORT, 'stay_overlap');
END;

CREATE TRIGGER IF NOT EXISTS stays_no_overlap_update
BEFORE UPDATE OF starts_at, ends_at ON stays
WHEN EXISTS (
  SELECT 1 FROM stays
  WHERE id <> NEW.id AND starts_at < NEW.ends_at AND ends_at > NEW.starts_at
)
BEGIN
  SELECT RAISE(ABORT, 'stay_overlap');
END;

CREATE TABLE IF NOT EXISTS auth_attempts (
  rate_key TEXT PRIMARY KEY,
  scope TEXT NOT NULL CHECK (scope IN ('guest', 'admin')),
  failures INTEGER NOT NULL DEFAULT 0 CHECK (failures >= 0),
  window_started_at INTEGER NOT NULL,
  locked_until INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_auth_attempts_cleanup
  ON auth_attempts (updated_at);
