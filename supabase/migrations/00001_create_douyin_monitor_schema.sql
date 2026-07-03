
-- 分类表
CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 博主表
CREATE TABLE bloggers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  douyin_user_id text UNIQUE NOT NULL,
  nickname text NOT NULL,
  avatar_url text,
  bio text,
  follower_count bigint DEFAULT 0,
  total_works bigint DEFAULT 0,
  home_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 博主分类关联表
CREATE TABLE blogger_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blogger_id uuid NOT NULL REFERENCES bloggers(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  UNIQUE(blogger_id, category_id)
);

-- 作品表
CREATE TABLE works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blogger_id uuid NOT NULL REFERENCES bloggers(id) ON DELETE CASCADE,
  douyin_aweme_id text UNIQUE NOT NULL,
  title text,
  cover_url text,
  video_url text,
  publish_time timestamptz,
  like_count bigint DEFAULT 0,
  comment_count bigint DEFAULT 0,
  share_count bigint DEFAULT 0,
  collect_count bigint DEFAULT 0,
  duration integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 文案逐字稿表
CREATE TABLE transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE UNIQUE,
  content text,
  word_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- AI分析结果表
CREATE TABLE ai_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE UNIQUE,
  content jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 高赞评论表
CREATE TABLE top_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  commenter_nickname text,
  commenter_avatar_url text,
  content text,
  like_count bigint DEFAULT 0,
  reply_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- AI配置表（单条记录）
CREATE TABLE ai_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key text,
  api_endpoint text,
  selected_model text,
  available_models jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 通知记录表
CREATE TABLE notification_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL, -- 'new_work' | 'daily_report'
  blogger_id uuid REFERENCES bloggers(id) ON DELETE SET NULL,
  work_id uuid REFERENCES works(id) ON DELETE SET NULL,
  message text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

-- RLS: 启用所有表
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE bloggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE blogger_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE works ENABLE ROW LEVEL SECURITY;
ALTER TABLE transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE top_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_logs ENABLE ROW LEVEL SECURITY;

-- RLS策略：全部允许匿名访问（个人工具应用，无多用户需求）
CREATE POLICY "allow_all_categories" ON categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_bloggers" ON bloggers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_blogger_categories" ON blogger_categories FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_works" ON works FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_transcripts" ON transcripts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ai_analyses" ON ai_analyses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_top_comments" ON top_comments FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_ai_configs" ON ai_configs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_notification_logs" ON notification_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 索引优化
CREATE INDEX idx_works_blogger_id ON works(blogger_id);
CREATE INDEX idx_works_publish_time ON works(publish_time DESC);
CREATE INDEX idx_blogger_categories_blogger ON blogger_categories(blogger_id);
CREATE INDEX idx_blogger_categories_category ON blogger_categories(category_id);
CREATE INDEX idx_top_comments_work_id ON top_comments(work_id);
