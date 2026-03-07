

CREATE TABLE users (
 username TEXT PRIMARY KEY,
 password VARCHAR(128) NOT NULL,
 CONSTRAINT users_username_not_blank CHECK (length(btrim(username)) > 0)
);


CREATE TABLE channels (
 id SERIAL PRIMARY KEY,
 name TEXT NOT NULL UNIQUE,
 description TEXT,
 CONSTRAINT channels_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE TABLE channel_members (
 uid  TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
 cid INT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
 joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (uid, cid)
);


INSERT INTO users(username, password) VALUES
('demo', repeat('a', 128)),
('alex', repeat('b', 128)),
('sam',  repeat('c', 128));


INSERT INTO channels(name, description) VALUES
('general', 'General chat'),
('help',    'Questions and answers'),
('random',  'Off-topic');


-- Membership
INSERT INTO channel_members(uid, cid)
SELECT 'demo', id FROM channels WHERE name IN ('general','help');


INSERT INTO channel_members(uid, cid)
SELECT 'alex', id FROM channels WHERE name IN ('general');


INSERT INTO channel_members(uid, cid)
SELECT 'sam', id FROM channels WHERE name IN ('general','random');