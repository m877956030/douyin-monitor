-- 多AI配置表（支持多个AI提供商）
CREATE TABLE IF NOT EXISTS ai_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,                        -- 显示名，如 "DeepSeek 主力"
  api_key text NOT NULL DEFAULT '',
  api_endpoint text NOT NULL DEFAULT '',
  selected_model text NOT NULL DEFAULT '',
  available_models jsonb NOT NULL DEFAULT '[]',
  is_active boolean NOT NULL DEFAULT false,  -- 当前激活的配置
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 写作风格模板表
CREATE TABLE IF NOT EXISTS writing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  content text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 迁移现有 ai_configs 数据到 ai_providers
INSERT INTO ai_providers (name, api_key, api_endpoint, selected_model, available_models, is_active, sort_order)
SELECT '默认配置', api_key, api_endpoint, selected_model, available_models, true, 0
FROM ai_configs
WHERE api_key IS NOT NULL AND api_key != ''
LIMIT 1
ON CONFLICT DO NOTHING;