-- 5분 연장 기능: match_sessions에 extended 컬럼 추가
ALTER TABLE match_sessions
ADD COLUMN IF NOT EXISTS extended BOOLEAN DEFAULT false;
