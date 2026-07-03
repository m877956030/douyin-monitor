-- 创建 ai-uploads 存储桶，用于存放 AI 对话中上传的文件
-- 该桶是公开的，AI API（如 OpenAI GPT-4o）可直接通过 URL 访问文件

-- 创建存储桶（如果不存在）
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'ai-uploads',
  'ai-uploads',
  true,                    -- 公开桶，可通过 URL 直接访问
  52428800,                -- 文件大小限制 50MB
  NULL                     -- 允许所有 MIME 类型
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit;

-- 允许匿名用户读取桶中的文件（公开访问）
DROP POLICY IF EXISTS "Public Read Access" ON storage.objects;
CREATE POLICY "Public Read Access" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'ai-uploads');

-- 允许匿名用户上传文件到桶中
DROP POLICY IF EXISTS "Anon Upload Access" ON storage.objects;
CREATE POLICY "Anon Upload Access" ON storage.objects
  FOR INSERT
  WITH CHECK (bucket_id = 'ai-uploads');

-- 允许文件创建者更新和删除自己的文件
DROP POLICY IF EXISTS "Owner Update Access" ON storage.objects;
CREATE POLICY "Owner Update Access" ON storage.objects
  FOR UPDATE
  USING (bucket_id = 'ai-uploads' AND auth.uid() = owner);

DROP POLICY IF EXISTS "Owner Delete Access" ON storage.objects;
CREATE POLICY "Owner Delete Access" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'ai-uploads' AND auth.uid() = owner);
