-- 作品指标快照表 — 每次刷新作品列表时保存一份快照，用于计算数据变化
CREATE TABLE IF NOT EXISTS work_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  like_count bigint DEFAULT 0,
  comment_count bigint DEFAULT 0,
  share_count bigint DEFAULT 0,
  collect_count bigint DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

-- 博主指标快照表 — 每次刷新博主信息时保存一份快照
CREATE TABLE IF NOT EXISTS blogger_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blogger_id uuid NOT NULL REFERENCES bloggers(id) ON DELETE CASCADE,
  follower_count bigint DEFAULT 0,
  total_works bigint DEFAULT 0,
  snapshot_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE work_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE blogger_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all_work_snapshots" ON work_snapshots FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "allow_all_blogger_snapshots" ON blogger_snapshots FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- 索引：按作品+时间倒序查询最快
CREATE INDEX idx_work_snapshots_work_time ON work_snapshots(work_id, snapshot_at DESC);
CREATE INDEX idx_blogger_snapshots_blogger_time ON blogger_snapshots(blogger_id, snapshot_at DESC);
