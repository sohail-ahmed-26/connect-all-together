-- The messages table currently lacks a way to distinguish between 'draft', 'pending', 'sent', and 'failed' states.
-- Adding a status column is highly recommended since the Conversation Agent generates 'draft' responses that should not be assumed as actually sent.
ALTER TABLE `messages` ADD COLUMN `status` varchar(50) NOT NULL DEFAULT 'sent';

-- The conversations table lacks an 'intent' or 'topic' tracking column, which would be useful for reporting on what this conversation is about.
ALTER TABLE `conversations` ADD COLUMN `last_intent` varchar(50);
