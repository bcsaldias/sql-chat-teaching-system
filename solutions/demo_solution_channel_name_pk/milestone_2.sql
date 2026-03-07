-- Notes, some columns might have different names than those suggested in the milestone doc.
-- For example, channel_id might be name in channels table.
-- There is some flexibility in how the students model their channels (id vs name unique).

-- I am requiring that students' frontend queries return a stable alias. For example,
-- instead of channels_list returning name, I am requiring it to return id. This is relevant
-- for milestone 4 when students will need to use the channel id to query for messages in that channel.

-- SQL schema for user authentication system
CREATE TABLE users (
 username VARCHAR(30) PRIMARY KEY,
 password VARCHAR(128) NOT NULL,
 CONSTRAINT users_username_not_blank CHECK (length(btrim(username)) > 0)
 -- OPTIONAL: Enforce password length of exactly 128 characters
 -- CONSTRAINT users_password_len_128 CHECK (length(password) = 128) 
);

-- SQL schema for channels
CREATE TABLE channels (
 name VARCHAR(30) PRIMARY KEY,
 description VARCHAR(150),
 CONSTRAINT channels_name_not_blank CHECK (length(name) > 0)
);

-- Students might decide to allow channels with same name, in which case they'd create an id field

-- SQL schema for channel membership
CREATE TABLE channel_members (
 username  VARCHAR(30) NOT NULL REFERENCES users(username),
 channel VARCHAR(30) NOT NULL REFERENCES channels(name),
 joined_at TIMESTAMPTZ NOT NULL DEFAULT now(), --- we don't actually need this, but it's ok to have.
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