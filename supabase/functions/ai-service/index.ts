// AI分析 & API配置验证 Edge Function（支持联网搜索 + 自动创建存储桶）
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 自动创建 ai-uploads 存储桶（用于 AI 对话文件上传）
const BUCKET_NAME = "ai-uploads";
const STORAGE_BUCKET_URL = "https://bnvghazgpnjntxfornwg.supabase.co/storage/v1/bucket";

async function ensureStorageBucket(): Promise<void> {
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!serviceKey) return;

  try {
    const res = await fetch(STORAGE_BUCKET_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: BUCKET_NAME,
        name: BUCKET_NAME,
        public: true,
        file_size_limit: 52428800,
        allowed_mime_types: null,
      }),
    });
    // 409 = 桶已存在，200/201 = 创建成功
    if (res.ok) {
      console.log(`Storage bucket '${BUCKET_NAME}' created/verified`);
    }
  } catch {
    // 静默忽略，客户端有回退
  }
}

// Tavily 搜索 API（用于联网搜索）
const TAVILY_ENDPOINT = "https://api.tavily.com/search";

async function searchWeb(query: string, apiKey: string): Promise<string> {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      search_depth: "basic",
      include_answer: true,
      max_results: 5,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`联网搜索失败: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const parts: string[] = [];

  // AI 总结段落
  if (data.answer) {
    parts.push(`【搜索结果总结】\n${data.answer}`);
  }

  // 逐条搜索结果
  if (data.results && data.results.length > 0) {
    parts.push(`【参考资料】`);
    for (let i = 0; i < data.results.length; i++) {
      const r = data.results[i];
      parts.push(`\n${i + 1}. ${r.title}\n   链接：${r.url}\n   摘要：${(r.content || "").slice(0, 1000)}`);
    }
  }

  return parts.join("\n\n");
}

const AI_ANALYSIS_PROMPT = `你是一位专业的短视频文案分析师。请对以下文案进行深度分析，严格按照JSON格式返回18个维度的分析结果，不要输出任何JSON以外的内容。

文案内容：
{CONTENT}

请返回如下JSON格式（每个字段为字符串，详细分析，不少于50字）：
{
  "title_analysis": "标题分析...",
  "opening_hook": "开头钩子类型...",
  "story_outline": "中间故事线大纲和要点...",
  "emotional_rhythm": "情感节奏、情绪曲线、情绪基调...",
  "language_dna": "语言DNA特征...",
  "cta_strategy": "CTA策略...",
  "tag_strategy": "标签策略...",
  "writing_style_prompt": "文风基因提示词...",
  "highlights": "可借鉴的地方...",
  "improvements": "需要修改的地方...",
  "target_audience": "受众人群分析...",
  "topic_breakdown": "选题拆解...",
  "copy_structure": "文案结构拆解...",
  "viral_factors": "爆点因素...",
  "writing_techniques": "写作技巧...",
  "narrative_style": "叙事特点及举例...",
  "content_features": "内容特征...",
  "ending_technique": "结尾技法..."
}`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, api_key, api_endpoint, content, model } = body;

    if (action === "test_connection") {
      // 测试AI API连接并获取模型列表
      const modelsUrl = api_endpoint.endsWith("/")
        ? `${api_endpoint}models`
        : `${api_endpoint}/models`;

      const res = await fetch(modelsUrl, {
        headers: {
          "Authorization": `Bearer ${api_key}`,
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        return new Response(
          JSON.stringify({ success: false, error: "API连接失败，请检查Key和接口地址" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      const models = (data.data || data.models || [])
        .map((m: Record<string, unknown>) => ({
          id: m.id || m.model_id,
          name: m.name || m.id || m.model_id,
        }))
        .filter((m: Record<string, unknown>) => m.id);

      return new Response(
        JSON.stringify({ success: true, models }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "analyze") {
      // 生成18维度AI分析
      if (!content || !api_key || !api_endpoint || !model) {
        return new Response(
          JSON.stringify({ error: "缺少必要参数" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const prompt = AI_ANALYSIS_PROMPT.replace("{CONTENT}", content);
      const chatUrl = api_endpoint.endsWith("/")
        ? `${api_endpoint}chat/completions`
        : `${api_endpoint}/chat/completions`;

      const res = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${api_key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          temperature: 0.7,
          max_tokens: 4000,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(
          JSON.stringify({ error: `AI分析失败: ${errText}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      const rawContent = data.choices?.[0]?.message?.content || "";

      // 解析JSON
      let analysis: Record<string, unknown> = {};
      try {
        const jsonMatch = rawContent.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysis = JSON.parse(jsonMatch[0]);
        }
      } catch {
        analysis = { raw: rawContent };
      }

      return new Response(
        JSON.stringify({ analysis }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (action === "chat") {
      // AI对话（支持可选联网搜索 + 自动创建存储桶）
      // 尝试创建存储桶（忽略失败，客户端有回退）
      ensureStorageBucket(); // fire-and-forget

      const { messages, api_key: ak, api_endpoint: ae, model: m, web_search, web_search_key } = body;
      if (!messages || !ak || !ae || !m) {
        return new Response(
          JSON.stringify({ error: "缺少必要参数" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      let finalMessages = messages;

      // 联网搜索：从最后一条用户消息中提取查询词，搜索后注入 system 消息
      if (web_search) {
        const tavilyKey = web_search_key || Deno.env.get("TAVILY_API_KEY") || "";
        if (!tavilyKey) {
          return new Response(
            JSON.stringify({ error: "联网搜索需要配置 Tavily API Key（在设置页配置）" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // 查找最后一条用户消息的内容作为搜索查询
        let query = "";
        for (let i = messages.length - 1; i >= 0; i--) {
          const msg = messages[i];
          if (msg.role === "user") {
            if (typeof msg.content === "string") {
              query = msg.content.slice(0, 300);
            } else if (Array.isArray(msg.content)) {
              const textPart = msg.content.find((p: Record<string, unknown>) => p.type === "text");
              query = typeof textPart?.text === "string" ? textPart.text.slice(0, 300) : "";
            }
            break;
          }
        }

        if (query.trim()) {
          try {
            const searchResult = await searchWeb(query.trim(), tavilyKey);
            // 将搜索结果作为 system 消息注入，排在原 messages 之前
            finalMessages = [
              {
                role: "system",
                content: `以下是针对用户问题的联网搜索结果，请基于这些信息并结合你的知识回答用户的问题。\n\n${searchResult}`,
              },
              ...messages,
            ];
          } catch (searchError) {
            // 搜索失败时，添加提示性 system 消息
            finalMessages = [
              {
                role: "system",
                content: `用户请求了联网搜索，但搜索服务暂时不可用（${searchError.message}）。请仅基于你的知识回答。`,
              },
              ...messages,
            ];
          }
        } else {
          // 没有找到用户消息作为搜索词
          return new Response(
            JSON.stringify({ error: "联网搜索无法确定搜索关键词，请发送一条包含问题的消息" }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      const chatUrl = ae.endsWith("/") ? `${ae}chat/completions` : `${ae}/chat/completions`;
      const res = await fetch(chatUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${ak}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: m,
          messages: finalMessages,
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        return new Response(
          JSON.stringify({ error: `AI请求失败: ${errText}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || "";
      return new Response(
        JSON.stringify({ reply }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── 文件上传（通过 Edge Function 代理，有 Service Role 权限） ─
    if (action === "upload_file") {
      const { bucket, file_path, file_base64, content_type } = body;
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("MY_SERVICE_KEY") || "";
      if (!bucket || !file_path || !file_base64 || !serviceKey) {
        return new Response(
          JSON.stringify({ error: "缺少必要参数或服务密钥" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const uploadUrl = `${Deno.env.get("SUPABASE_URL")}/storage/v1/object/${bucket}/${file_path}`;
      const binaryStr = atob(file_base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceKey}`,
          "Content-Type": content_type || "application/octet-stream",
          "x-upsert": "true",
        },
        body: bytes.buffer,
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        return new Response(
          JSON.stringify({ error: `上传失败: ${errText.slice(0, 200)}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ success: true, path: file_path }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "未知操作类型" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: `服务器错误: ${error.message}` }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
