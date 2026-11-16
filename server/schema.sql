CREATE TABLE IF NOT EXISTS schema_version(version integer PRIMARY KEY);
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, username text NOT NULL UNIQUE, display_name text NOT NULL,
 password_hash text NOT NULL, wechat_openid text,
 is_admin boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS wechat_openid text;
CREATE TABLE IF NOT EXISTS sessions (
 token_hash text PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS clubs (
 id uuid PRIMARY KEY, name text NOT NULL UNIQUE, description text NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS memberships (
 club_id uuid NOT NULL REFERENCES clubs ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 role text NOT NULL CHECK(role IN ('owner','admin','member')),
 PRIMARY KEY(club_id,user_id)
);
CREATE TABLE IF NOT EXISTS applications (
 club_id uuid NOT NULL REFERENCES clubs ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','rejected')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(club_id,user_id)
);
CREATE TABLE IF NOT EXISTS characters (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
 club_id uuid REFERENCES clubs ON DELETE SET NULL, name text NOT NULL,
 profession_id integer NOT NULL, score integer NOT NULL CHECK(score >= 0),
 profile jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(club_id,user_id) REFERENCES memberships(club_id,user_id) ON DELETE SET NULL (club_id)
);
CREATE TABLE IF NOT EXISTS events (
 id uuid PRIMARY KEY, club_id uuid NOT NULL REFERENCES clubs ON DELETE CASCADE,
 title text NOT NULL, description text NOT NULL DEFAULT '',
 starts_at timestamptz NOT NULL, deadline timestamptz NOT NULL,
 team_count integer NOT NULL DEFAULT 3 CHECK(team_count BETWEEN 1 AND 20),
 revision integer NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(deadline <= starts_at)
);
CREATE TABLE IF NOT EXISTS signups (
 event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
 character_id uuid NOT NULL REFERENCES characters ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(event_id,character_id)
);
CREATE TABLE IF NOT EXISTS slots (
 event_id uuid NOT NULL REFERENCES events ON DELETE CASCADE,
 team integer NOT NULL CHECK(team BETWEEN 1 AND 20),
 position integer NOT NULL CHECK(position BETWEEN 0 AND 29),
 character_id uuid NOT NULL REFERENCES characters ON DELETE CASCADE,
 config jsonb NOT NULL, PRIMARY KEY(event_id,team,position),
 UNIQUE(event_id,character_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_characters_club ON characters(club_id);
CREATE INDEX IF NOT EXISTS idx_events_club ON events(club_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_wechat_openid ON users(wechat_openid) WHERE wechat_openid IS NOT NULL;
INSERT INTO schema_version VALUES(1) ON CONFLICT DO NOTHING;
ALTER TABLE events ALTER COLUMN team_count SET DEFAULT 3;
