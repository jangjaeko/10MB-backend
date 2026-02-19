-- ============================================
-- 10MinBreak - users 테이블 및 관련 테이블 스키마
-- Supabase SQL 에디터에서 실행
-- ============================================

-- UUID 확장 활성화
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. users 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY,                               -- Supabase Auth uid 와 동일
  email       TEXT NOT NULL UNIQUE,                            -- 이메일 (Google OAuth에서 제공)
  nickname    TEXT UNIQUE,                                     -- 닉네임 (온보딩 시 설정, 중복 불가)
  avatar_url  TEXT,                                            -- 프로필 이미지 URL
  interests   TEXT[] NOT NULL DEFAULT '{}',                    -- 관심사 태그 배열
  total_calls INTEGER NOT NULL DEFAULT 0,                     -- 총 통화 횟수
  total_minutes INTEGER NOT NULL DEFAULT 0,                   -- 총 통화 시간 (분)
  is_online   BOOLEAN NOT NULL DEFAULT FALSE,                 -- 현재 접속 여부
  last_seen_at TIMESTAMPTZ,                                   -- 마지막 접속 시각
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),             -- 가입 시각
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()              -- 수정 시각
);

-- 인덱스: 이메일 조회
CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

-- 인덱스: 닉네임 중복 체크 / 검색
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users (nickname);

-- 인덱스: 온라인 유저 필터링
CREATE INDEX IF NOT EXISTS idx_users_is_online ON users (is_online) WHERE is_online = TRUE;

-- updated_at 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================
-- 2. match_sessions 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS match_sessions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),  -- 세션 ID
  status          TEXT NOT NULL DEFAULT 'waiting'                -- waiting / matched / active / completed / cancelled
                  CHECK (status IN ('waiting', 'matched', 'active', 'completed', 'cancelled')),
  interests       TEXT[] NOT NULL DEFAULT '{}',                  -- 매칭된 공통 관심사
  agora_channel_id TEXT,                                         -- Agora 채널 ID
  started_at      TIMESTAMPTZ,                                   -- 통화 시작 시각
  ends_at         TIMESTAMPTZ,                                   -- 통화 종료 예정 시각
  actual_ended_at TIMESTAMPTZ,                                   -- 실제 종료 시각
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()             -- 생성 시각
);

-- 인덱스: 활성 세션 조회
CREATE INDEX IF NOT EXISTS idx_match_sessions_status ON match_sessions (status);

-- ============================================
-- 3. match_participants 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS match_participants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),       -- 참가 ID
  session_id  UUID NOT NULL REFERENCES match_sessions(id) ON DELETE CASCADE,  -- 세션 FK
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,           -- 유저 FK
  rating      TEXT CHECK (rating IN ('good', 'neutral')),        -- 상대방 평가
  reported    BOOLEAN NOT NULL DEFAULT FALSE,                    -- 신고 여부
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),                -- 참가 시각
  UNIQUE (session_id, user_id)                                   -- 같은 세션에 중복 참가 방지
);

-- 인덱스: 유저별 참가 이력 조회
CREATE INDEX IF NOT EXISTS idx_match_participants_user_id ON match_participants (user_id);
CREATE INDEX IF NOT EXISTS idx_match_participants_session_id ON match_participants (session_id);

-- ============================================
-- 4. reports 테이블
-- ============================================
CREATE TABLE IF NOT EXISTS reports (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),       -- 신고 ID
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- 신고자 FK
  reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,   -- 피신고자 FK
  session_id  UUID REFERENCES match_sessions(id) ON DELETE SET NULL,  -- 관련 세션 FK
  reason      TEXT NOT NULL                                      -- 신고 사유
              CHECK (reason IN ('harassment', 'spam', 'inappropriate', 'other')),
  description TEXT,                                              -- 상세 설명
  status      TEXT NOT NULL DEFAULT 'pending'                    -- pending / reviewed / resolved
              CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()                 -- 신고 시각
);

-- 인덱스: 피신고자별 조회
CREATE INDEX IF NOT EXISTS idx_reports_reported_id ON reports (reported_id);
-- 인덱스: 상태별 조회
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status) WHERE status = 'pending';

-- ============================================
-- 5. RLS (Row Level Security) 정책
-- ============================================

-- users 테이블 RLS 활성화
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- 본인 프로필 조회 허용
CREATE POLICY "users_select_own" ON users
  FOR SELECT USING (auth.uid() = id);

-- 본인 프로필 수정 허용
CREATE POLICY "users_update_own" ON users
  FOR UPDATE USING (auth.uid() = id);

-- 서비스 롤은 모든 작업 허용 (백엔드 서버용)
CREATE POLICY "users_service_role" ON users
  FOR ALL USING (auth.role() = 'service_role');

-- match_sessions RLS
ALTER TABLE match_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match_sessions_service_role" ON match_sessions
  FOR ALL USING (auth.role() = 'service_role');

-- match_participants RLS
ALTER TABLE match_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "match_participants_service_role" ON match_participants
  FOR ALL USING (auth.role() = 'service_role');

-- reports RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reports_service_role" ON reports
  FOR ALL USING (auth.role() = 'service_role');
