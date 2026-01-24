-- The challenge with this solutions is what happens when users leave?
-- Also, to post we need to retrieve membership and then INSERT into chat_inbox
-- 
CREATE TABLE chat_inbox (
    message_id BIGSERIAL PRIMARY KEY,
    membership_id TEXT NOT NULL REFERENCES users(channel_members) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chat_body_not_blank CHECK (length(btrim(body)) > 0),
    CONSTRAINT chat_body_len CHECK (length(body) <= 500)
);

-- It could be done manually, or through something like this.
INSERT INTO
    chat_inbox (membership_id, body, created_at)
SELECT
    cm.membership_id,
    format('hello from %s', cm.username),
    now() - (random() * interval '2 days')
FROM
    channel_members cm;