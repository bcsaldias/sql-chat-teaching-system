

-- SQL schema for chat inbox system
CREATE TABLE chat_inbox (
 message_id BIGSERIAL PRIMARY KEY,
 username   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
 channel_id TEXT NOT NULL REFERENCES channels(name) ON DELETE CASCADE,
 body       TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT chat_body_not_blank CHECK (length(btrim(body)) > 0),
 CONSTRAINT chat_body_len CHECK (length(body) <= 500)
);


INSERT INTO chat_inbox(username, channel_id, body, created_at) VALUES
('belen', 'general', 'Welcome to SQL Chat!', now() - interval '6 minutes');

INSERT INTO chat_inbox(username, channel_id, body, created_at) VALUES
('charlene', 'general', 'Try joining #random if you want.', now() - interval '6 minutes');

INSERT INTO chat_inbox(username, channel_id, body, created_at) VALUES
('justin_m', 'general', 'Posting works when your membership is set.', now() - interval '2 minutes');
