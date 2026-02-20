-- ============================================
-- 10MinBreak v2 - 대화방, 친구, 채팅, 알림 테이블
-- 003_reports.sql 실행 후 이 파일을 Supabase SQL 에디터에서 실행
-- ============================================

-- ============================================
-- 1. rooms 테이블 (테마 대화방)
-- ============================================
CREATE TABLE IF NOT EXISTS rooms (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  TEXT NOT NULL,
  theme                 TEXT NOT NULL,
  icon                  TEXT NOT NULL,
  max_participants      INT NOT NULL DEFAULT 5,
  current_participants  INT NOT NULL DEFAULT 0,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rooms_is_active ON rooms(is_active);
CREATE INDEX IF NOT EXISTS idx_rooms_theme ON rooms(theme);

-- ============================================
-- 2. room_participants 테이블 (대화방 참가자)
-- ============================================
CREATE TABLE IF NOT EXISTS room_participants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_room_participants_room ON room_participants(room_id);
CREATE INDEX IF NOT EXISTS idx_room_participants_user ON room_participants(user_id);

-- ============================================
-- 3. friendships 테이블 (친구 관계)
-- ============================================
CREATE TABLE IF NOT EXISTS friendships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'blocked')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(requester_id, addressee_id)
);

CREATE INDEX IF NOT EXISTS idx_friendships_requester ON friendships(requester_id);
CREATE INDEX IF NOT EXISTS idx_friendships_addressee ON friendships(addressee_id);
CREATE INDEX IF NOT EXISTS idx_friendships_status ON friendships(status);

-- ============================================
-- 4. messages 테이블 (1:1 채팅)
-- ============================================
CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  receiver_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content       TEXT NOT NULL,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver ON messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages(sender_id, receiver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages(receiver_id, is_read) WHERE is_read = FALSE;

-- ============================================
-- 5. notifications 테이블 (알림)
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  data        JSONB DEFAULT '{}',
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_unread
  ON notifications(user_id, is_read) WHERE is_read = FALSE;

-- ============================================
-- 6. RLS 정책 (service_role만 접근)
-- ============================================
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'rooms' AND policyname = 'rooms_service_role_all') THEN
    CREATE POLICY rooms_service_role_all ON rooms FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'room_participants' AND policyname = 'room_participants_service_role_all') THEN
    CREATE POLICY room_participants_service_role_all ON room_participants FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'friendships' AND policyname = 'friendships_service_role_all') THEN
    CREATE POLICY friendships_service_role_all ON friendships FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'messages' AND policyname = 'messages_service_role_all') THEN
    CREATE POLICY messages_service_role_all ON messages FOR ALL USING (auth.role() = 'service_role');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'notifications_service_role_all') THEN
    CREATE POLICY notifications_service_role_all ON notifications FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================
-- 7. 초기 대화방 데이터
-- ============================================
INSERT INTO rooms (name, theme, icon, max_participants) VALUES
  ('흡연실 1', 'smoking', '🚬', 5),
  ('흡연실 2', 'smoking', '🚬', 5),
  ('옥상',     'rooftop', '🌙', 5),
  ('카페',     'cafe',    '☕', 10),
  ('공원',     'park',    '🌳', 5),
  ('산책',     'walk',    '🚶', 5),
  ('게임',     'game',    '🎮', 5),
  ('독서',     'reading', '📚', 5)
ON CONFLICT DO NOTHING;
