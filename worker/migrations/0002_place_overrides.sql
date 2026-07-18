-- Auditable editorial overrides for the generated destination guide.
-- The public catalog remains static; these rows are exported only after review.

CREATE TABLE IF NOT EXISTS place_overrides (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL CHECK (action IN ('category', 'location', 'website', 'instagram', 'closed', 'merge', 'add')),
  place_id TEXT NOT NULL,
  target_place_id TEXT,
  payload_json TEXT NOT NULL,
  reason TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK (length(place_id) BETWEEN 1 AND 160),
  CHECK (length(reason) BETWEEN 3 AND 500),
  CHECK ((action = 'merge' AND target_place_id IS NOT NULL) OR (action <> 'merge' AND target_place_id IS NULL))
);

CREATE INDEX IF NOT EXISTS idx_place_overrides_place
  ON place_overrides (place_id, action, updated_at);

CREATE TABLE IF NOT EXISTS place_override_history (
  id TEXT PRIMARY KEY,
  override_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('create', 'update_before', 'delete', 'revert_before')),
  snapshot_json TEXT NOT NULL,
  revision INTEGER NOT NULL,
  created_by TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_place_override_history_override
  ON place_override_history (override_id, created_at DESC);

