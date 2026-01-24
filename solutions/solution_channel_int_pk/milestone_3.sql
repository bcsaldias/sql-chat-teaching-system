 
CREATE TABLE chat_inbox (
 id BIGSERIAL PRIMARY KEY,
 user_id   TEXT NOT NULL REFERENCES users(username) ON DELETE CASCADE,
 chan_id INT  NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
 body       TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CONSTRAINT chat_body_not_blank CHECK (length(btrim(body)) > 0),
 CONSTRAINT chat_body_len CHECK (length(body) <= 500)
);

INSERT INTO chat_inbox(user_id, chan_id, body, created_at)
SELECT 'demo', id, 'Welcome to SQL Chat!', now() - interval '6 minutes'
FROM channels WHERE name='general';


INSERT INTO chat_inbox(user_id, chan_id, body, created_at)
SELECT 'alex', id, 'Try joining #random if you want.', now() - interval '4 minutes'
FROM channels WHERE name='general';


INSERT INTO chat_inbox(user_id, chan_id, body, created_at)
SELECT 'sam', id, 'Posting works when your membership is set.', now() - interval '2 minutes'
FROM channels WHERE name='random';
