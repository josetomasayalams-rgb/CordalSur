-- Automatic guest-access windows derived from the operational calendar.
-- The source contains no guest data here: only merged UTC access windows and
-- synchronization health are retained. Manual stays remain in `stays`.

CREATE TABLE IF NOT EXISTS calendar_access_windows (
  id TEXT PRIMARY KEY CHECK (id LIKE 'calendar:%'),
  label TEXT NOT NULL DEFAULT 'Calendario operativo',
  starts_at INTEGER NOT NULL,
  ends_at INTEGER NOT NULL,
  source_count INTEGER NOT NULL CHECK (source_count > 0),
  source_hash TEXT NOT NULL CHECK (length(source_hash) = 64),
  revision INTEGER NOT NULL CHECK (revision > 0),
  updated_at INTEGER NOT NULL,
  CHECK (starts_at < ends_at)
);

CREATE INDEX IF NOT EXISTS idx_calendar_access_windows_active
  ON calendar_access_windows (starts_at, ends_at);

CREATE TABLE IF NOT EXISTS calendar_access_sync (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  status TEXT NOT NULL CHECK (status IN ('ok', 'error')),
  last_attempt_at INTEGER NOT NULL,
  last_success_at INTEGER,
  source_rows INTEGER NOT NULL DEFAULT 0 CHECK (source_rows >= 0),
  window_count INTEGER NOT NULL DEFAULT 0 CHECK (window_count >= 0),
  ignored_rows INTEGER NOT NULL DEFAULT 0 CHECK (ignored_rows >= 0),
  error_code TEXT
);
