PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS request_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 1,
  expires INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_limits_expires ON request_limits(expires);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'grid',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS apps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  developer TEXT NOT NULL DEFAULT '',
  package_name TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '',
  android_version TEXT NOT NULL DEFAULT '',
  short_description TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  changelog TEXT NOT NULL DEFAULT '',
  category_id INTEGER,
  apk_key TEXT NOT NULL,
  icon_key TEXT,
  file_size INTEGER NOT NULL DEFAULT 0,
  featured INTEGER NOT NULL DEFAULT 0 CHECK (featured IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  downloads_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL,
  object_key TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'read')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_apps_status_created ON apps(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_apps_category ON apps(category_id);
CREATE INDEX IF NOT EXISTS idx_apps_featured ON apps(featured, status);
CREATE INDEX IF NOT EXISTS idx_downloads_app ON downloads(app_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_screenshots_app ON screenshots(app_id, sort_order);

INSERT OR IGNORE INTO categories (name, slug, description, icon) VALUES
  ('Tools', 'tools', 'Utilities, productivity tools, file managers and everyday helpers.', 'tool'),
  ('Social', 'social', 'Social, messaging and community apps.', 'users'),
  ('Photo & Video', 'photo-video', 'Editors, cameras, media tools and creative apps.', 'image'),
  ('Entertainment', 'entertainment', 'Streaming, media and entertainment apps.', 'play'),
  ('Games', 'games', 'Mobile games across popular genres.', 'gamepad'),
  ('Education', 'education', 'Learning, study and reference apps.', 'book'),
  ('Business', 'business', 'Business, commerce and professional utilities.', 'briefcase'),
  ('Lifestyle', 'lifestyle', 'Everyday lifestyle and personal utility apps.', 'sparkles');
