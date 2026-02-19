-- 신고 테이블 (유저 간 신고 내역 저장)

CREATE TABLE IF NOT EXISTS reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES match_sessions(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (reason IN ('harassment', 'spam', 'inappropriate', 'other')),
  description TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_reports_reporter ON reports(reporter_id);
CREATE INDEX IF NOT EXISTS idx_reports_reported ON reports(reported_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- RLS 정책 (service_role만 접근 가능)
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'reports' AND policyname = 'reports_service_role_all'
  ) THEN
    CREATE POLICY reports_service_role_all ON reports
      FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;
