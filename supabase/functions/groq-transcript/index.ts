// Groq语音转文字 Edge Function（兜底方案，主方案已改为抖音内置字幕）
// 所有响应均返回 HTTP 200，错误放在 JSON body { error: "..." }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const JSON_HDR = { ...CORS, "Content-Type": "application/json" };
const ok = (d: unknown) => new Response(JSON.stringify(d), { status: 200, headers: JSON_HDR });
const fail = (msg: string) => {
  console.error("[groq-transcript] fail:", msg.slice(0, 200));
  return new Response(JSON.stringify({ error: msg }), { status: 200, headers: JSON_HDR });
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { video_url, aweme_id } = await req.json();
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") || "";

    if (!video_url) return fail("缺少 video_url 参数");
    if (!GROQ_API_KEY) return fail("未配置 GROQ_API_KEY，请在设置中填写");

    const videoRes = await fetch(video_url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Referer": "https://www.douyin.com/",
      },
    });
    if (!videoRes.ok) return fail(`视频下载失败 status=${videoRes.status}`);

    const audioBuffer = await videoRes.arrayBuffer();
    const audioBlob = new Blob([audioBuffer], { type: "audio/mp4" });

    const formData = new FormData();
    formData.append("file", audioBlob, `${aweme_id || "audio"}.mp4`);
    formData.append("model", "whisper-large-v3");
    formData.append("language", "zh");
    formData.append("response_format", "verbose_json");

    const groqRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: formData,
    });
    if (!groqRes.ok) {
      const errText = await groqRes.text();
      return fail(`Groq API 错误: ${errText.slice(0, 300)}`);
    }

    const result = await groqRes.json();
    const content = result.text || "";
    return ok({ content, word_count: content.replace(/\s/g, "").length });
  } catch (e) {
    return fail(`服务器错误: ${(e as Error).message}`);
  }
});
