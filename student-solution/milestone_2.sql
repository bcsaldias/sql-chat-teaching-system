-- Notes, some columns might have different names than those suggested in the milestone doc.
-- For example, channel_id might be name in channels table.
-- There is some flexibility in how the students model their channels (id vs name unique).

-- SQL schema for user authentication system
CREATE TABLE users (
 username TEXT PRIMARY KEY,
 password VARCHAR(128) NOT NULL,
 CONSTRAINT users_username_not_blank CHECK (length(btrim(username)) > 0)
 -- OPTIONAL: Enforce password length of exactly 128 characters
 -- CONSTRAINT users_password_len_128 CHECK (length(password) = 128) 
);

-- SQL schema for channels
CREATE TABLE channels (
 name TEXT PRIMARY KEY,
 description TEXT,
 CONSTRAINT channels_name_not_blank CHECK (length(name) > 0)
);

-- Students might decide to allow channels with same name, in which case they'd create an id field

-- SQL schema for channel membership
CREATE TABLE channel_members (
 username  TEXT NOT NULL REFERENCES users(username),
 channel TEXT NOT NULL REFERENCES channels(name),
 joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 PRIMARY KEY (username, channel)
);



INSERT INTO users(username, password) VALUES
('belen', repeat('a', 128)), -- must be 128 characters only if the constraint is enforced
('charlene', repeat('b', 128)),
('justin_m',  repeat('c', 128)),
('justin_d',  repeat('c', 128)),
('gunner',  repeat('c', 128));


INSERT INTO channels(name, description) VALUES
('general', 'General chat'),
('help',    'Questions and answers'),
('random',  'Off-topic');


-- Membership
INSERT INTO channel_members(username, channel) VALUES
('belen', 'general'),
('belen', 'help');

INSERT INTO channel_members(username, channel) VALUES
('justin_m', 'general'),
('charlene', 'general');


INSERT INTO channel_members(username, channel) VALUES
('gunner', 'random'),
('justin_d', 'random');