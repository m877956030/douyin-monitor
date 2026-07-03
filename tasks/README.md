# 抖音博主监控 App — 部署说明

## 技术栈
- React Native + Expo SDK 55
- expo-router (文件路由)
- NativeWind v4 + Tailwind CSS v3
- Supabase (数据库 + Edge Functions)
- TypeScript

---

## 一、前置准备

### 1. 安装依赖工具
```bash
npm install -g pnpm
# 或 corepack enable && corepack prepare pnpm@latest --activate
```

### 2. 安装 Expo CLI
```bash
npm install -g expo-cli
```

---

## 二、新建 Supabase 项目

1. 前往 https://supabase.com → 新建项目
2. 记录以下信息：
   - Project URL：`https://xxx.supabase.co`
   - Anon Key（公开密钥）
   - Service Role Key（私密，仅 Edge Function 用）

### 执行数据库迁移
在 Supabase Dashboard → SQL Editor 中，**按顺序**执行以下文件：

```
supabase/migrations/00001_create_douyin_monitor_schema.sql
supabase/migrations/00002_add_app_settings_table.sql
supabase/migrations/00003_add_sec_uid_to_bloggers.sql
supabase/migrations/00004_add_subtitle_url_to_works.sql
supabase/migrations/00005_add_multi_ai_and_writing_templates.sql
supabase/migrations/00006_add_play_url_to_works.sql
```

---

## 三、配置环境变量

复制 `.env.example` → `.env`（源码包已包含 `.env.example`），填入你自己的 Supabase 信息：

```env
EXPO_PUBLIC_APP_ID=your-app-id
EXPO_PUBLIC_SUPABASE_URL=https://你的项目.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=你的anon_key
```

---

## 四、部署 Edge Functions

使用 Supabase CLI 部署（或在 Dashboard → Edge Functions 中粘贴代码）：

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 链接项目
supabase link --project-ref 你的project_ref

# 设置 Edge Function 环境变量
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=你的service_role_key

# 部署所有 Functions
supabase functions deploy douyin-fetch
supabase functions deploy douyin-comments
supabase functions deploy ai-service
supabase functions deploy groq-transcript
```

---

## 五、安装前端依赖并运行

```bash
# 安装依赖
pnpm install

# 启动开发服务器（Web 预览）
pnpm expo start --web

# iOS
pnpm expo run:ios

# Android
pnpm expo run:android
```

---

## 六、App 内配置

首次打开 App 后，进入"设置"页面：

1. **抖音 Cookie**：从浏览器开发者工具中复制抖音登录态 Cookie（需包含 `sessionid` 字段）
2. **AI 提供商**：添加 DeepSeek / OpenAI / Claude 等兼容 OpenAI 协议的 API
   - API Endpoint 示例：`https://api.deepseek.com`
   - 填入 API Key 后点击"测试连接"获取可用模型
3. **硅基流动 Key**（可选）：用于音频逐字稿转录
   - 注册：https://siliconflow.cn
   - 模型：`FunAudioLLM/SenseVoiceSmall`（免费）

---

## 七、核心功能说明

| 功能 | 说明 |
|------|------|
| 博主监控 | 添加博主主页链接，自动获取最新作品 |
| 文案获取 | 优先字幕 → 硅基流动音频转录 → 视频描述 |
| AI 分析 | 18 维度文风深度分析（浅色主题） |
| AI 对话 | 基于当前文案的对话，支持 @引用其他作品、写作模板 |
| 模型切换 | 对话界面顶部可直接切换 AI 提供商 |
| 评论分析 | 获取热门评论 |

---

## 注意事项

- 抖音 Cookie 有时效，若数据获取失败请重新配置
- 硅基流动免费额度有限，建议充值少量余额
- Edge Functions 依赖 `SUPABASE_SERVICE_ROLE_KEY` 环境变量，部署时务必设置
