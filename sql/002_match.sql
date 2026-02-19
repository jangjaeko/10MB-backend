-- ============================================
-- 10MinBreak - 매칭 관련 테이블 (match_sessions, match_participants)
-- 001_users.sql 실행 후 이 파일을 Supabase SQL 에디터에서 실행
-- ============================================

-- match_sessions 테이블이 이미 있으면 인덱스만 추가
-- (001_users.sql에서 이미 생성된 경우 스킵됨)

-- ============================================
-- 1. match_sessions 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS match_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  status          TEXT NOT NULL DEFAULT 'waiting'
                  CHECK (status IN ('waiting', 'matched', 'active', 'completed', 'cancelled')),
  interests       TEXT[] NOT NULL DEFAULT '{}',
  agora_channel_id TEXT,
  started_at      TIMESTAMPTZ,
  ends_at         TIMESTAMPTZ,
  actual_ended_at TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 상태별 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_match_sessions_status
  ON match_sessions (status);

-- 생성 시각 정렬 인덱스
CREATE INDEX IF NOT EXISTS idx_match_sessions_created_at
  ON match_sessions (created_at DESC);

-- 활성 세션만 빠르게 조회하는 부분 인덱스
CREATE INDEX IF NOT EXISTS idx_match_sessions_active
  ON match_sessions (status)
  WHERE status IN ('waiting', 'matched', 'active');

-- ============================================
-- 2. match_participants 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS match_participants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id  UUID NOT NULL REFERENCES match_sessions(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating      TEXT CHECK (rating IN ('good', 'neutral')),
  reported    BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, user_id)
);

-- 유저별 참가 이력 조회
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id
  ON match_participants (user_id);

-- 세션별 참가자 조회
CREATE INDEX IF NOT EXISTS idx_match_participants_session_id
  ON match_participants (session_id);

-- 유저별 최근 매칭 조회 (통계용)
CREATE INDEX IF NOT EXISTS idx_match_participants_user_joined
  ON match_participants (user_id, joined_at DESC);

-- ============================================
-- 3. RLS 정책 (이미 있으면 스킵)
-- ============================================
ALTER TABLE match_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;

-- 서비스 롤 전체 접근 (이미 존재하면 에러 무시)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'match_sessions_service_role'
  ) THEN
    CREATE POLICY "match_sessions_service_role" ON match_sessions
      FOR ALL USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'match_participants_service_role'
  ) THEN
    CREATE POLICY "match_participants_service_role" ON match_participants
      FOR ALL USING (auth.role() = 'service_role');
  END IF;

  -- 유저 본인 참가 이력 조회 허용
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'match_participants_select_own'
  ) THEN
    CREATE POLICY "match_participants_select_own" ON match_participants
      FOR SELECT USING (auth.uid() = user_id);
  END IF;
END $$;
