-- kb-vault D1 schema
-- SQLite + FTS5

-- ============================================================
-- Users
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,           -- ulid
  email       TEXT UNIQUE NOT NULL,
  name        TEXT,
  picture     TEXT,
  created_at  INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL
);

-- ============================================================
-- Notes (cards)
-- ============================================================
CREATE TABLE IF NOT EXISTS notes (
  id          TEXT PRIMARY KEY,           -- ulid
  user_id     TEXT NOT NULL,
  title       TEXT NOT NULL,
  content     TEXT NOT NULL,              -- markdown
  category    TEXT,                       -- e.g. "tech", "tech/ai-ml"
  source      TEXT,                       -- "manual" | "rss" | "mcp" | "import"
  source_url  TEXT,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_category ON notes(category);

-- ============================================================
-- Tags (note <-> tag many-to-many)
-- ============================================================
CREATE TABLE IF NOT EXISTS tags (
  note_id  TEXT NOT NULL,
  tag      TEXT NOT NULL,
  PRIMARY KEY (note_id, tag),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_tags_tag ON tags(tag);

-- ============================================================
-- Links (note <-> note for graph view)
-- ============================================================
CREATE TABLE IF NOT EXISTS links (
  from_id   TEXT NOT NULL,
  to_id     TEXT NOT NULL,
  link_type TEXT,                          -- "wiki" | "related" | "cite"
  PRIMARY KEY (from_id, to_id),
  FOREIGN KEY (from_id) REFERENCES notes(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES notes(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_links_to ON links(to_id);

-- ============================================================
-- RSS feeds
-- ============================================================
CREATE TABLE IF NOT EXISTS rss_feeds (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL,
  url             TEXT NOT NULL,
  title           TEXT,
  category        TEXT,
  active          INTEGER NOT NULL DEFAULT 1,
  last_fetched_at INTEGER,
  created_at      INTEGER NOT NULL,
  UNIQUE (user_id, url),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- RSS items (de-duped by guid)
-- ============================================================
CREATE TABLE IF NOT EXISTS rss_items (
  id              TEXT PRIMARY KEY,
  feed_id         TEXT NOT NULL,
  guid            TEXT NOT NULL,
  title           TEXT,
  link            TEXT,
  summary         TEXT,
  published_at    INTEGER,
  fetched_at      INTEGER NOT NULL,
  saved_to_note_id TEXT,                  -- NULL if not yet saved as a note
  UNIQUE (feed_id, guid),
  FOREIGN KEY (feed_id) REFERENCES rss_feeds(id) ON DELETE CASCADE,
  FOREIGN KEY (saved_to_note_id) REFERENCES notes(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_rss_items_feed ON rss_items(feed_id, published_at DESC);

-- ============================================================
-- Sync log (Notion / GitHub external state)
-- ============================================================
CREATE TABLE IF NOT EXISTS sync_log (
  note_id        TEXT NOT NULL,
  target         TEXT NOT NULL,            -- "notion" | "github"
  external_id    TEXT,                     -- Notion page id / GitHub path
  last_synced_at INTEGER NOT NULL,
  PRIMARY KEY (note_id, target),
  FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
);

-- ============================================================
-- MCP tokens metadata (actual token hash stored in KV)
-- ============================================================
CREATE TABLE IF NOT EXISTS mcp_tokens (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  label       TEXT,                        -- user-friendly name
  token_hash  TEXT UNIQUE NOT NULL,        -- sha256 of token
  created_at  INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================
-- Full-text search (FTS5)
-- ============================================================
CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
  title,
  content,
  category UNINDEXED,
  user_id UNINDEXED,
  content='notes',
  content_rowid='rowid',
  tokenize='unicode61'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS notes_ai AFTER INSERT ON notes BEGIN
  INSERT INTO notes_fts(rowid, title, content, category, user_id)
  VALUES (new.rowid, new.title, new.content, new.category, new.user_id);
END;

CREATE TRIGGER IF NOT EXISTS notes_ad AFTER DELETE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content, category, user_id)
  VALUES ('delete', old.rowid, old.title, old.content, old.category, old.user_id);
END;

CREATE TRIGGER IF NOT EXISTS notes_au AFTER UPDATE ON notes BEGIN
  INSERT INTO notes_fts(notes_fts, rowid, title, content, category, user_id)
  VALUES ('delete', old.rowid, old.title, old.content, old.category, old.user_id);
  INSERT INTO notes_fts(rowid, title, content, category, user_id)
  VALUES (new.rowid, new.title, new.content, new.category, new.user_id);
END;
