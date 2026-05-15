-- =============================================================================
-- Conversation sessions for bot state persistence
-- =============================================================================

CREATE TABLE IF NOT EXISTS conversation_sessions (
  telegram_id BIGINT PRIMARY KEY REFERENCES profiles(telegram_id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'idle',
  data JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated 
  ON conversation_sessions(updated_at);
