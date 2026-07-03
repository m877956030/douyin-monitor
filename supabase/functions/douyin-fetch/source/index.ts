// 抖音数据获取 Edge Function
// 所有响应均返回 HTTP 200，错误信息放在 JSON body { error: "..." }
// 这样 supabase.functions.invoke 能正确透传错误详情到客户端
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const JSON_HEADERS = { ...CORS, "Content-Type": "application/json" };

// DB 查询专用头：PostgREST 需要 Accept-Profile 来指定 public schema
function dbHeaders(key: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    "Accept-Profile": "public",
  };
}

const ok = (data: unknown) =>
  new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS });

const fail = (msg: string) => {
  console.error("[douyin-fetch] fail:", msg.slice(0, 200));
  return new Response(JSON.stringify({ error: msg }), { status: 200, headers: JSON_HEADERS });
};

// 从混合文本中提取第一个 HTTP URL
function extractUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s"'<>）。，、]+/);
  return m ? m[0].replace(/[）。，、\s]+$/, "") : null;
}

// 从 URL 中提取 sec_uid（支持路径 /user/xxx 和 query 参数 sec_uid=xxx）
function extractSecUid(url: string): string | null {
  try {
    const pathM = url.match(/\/user\/([^/?&\s#]+)/);
    if (pathM) return decodeURIComponent(pathM[1]);
    const qM = url.match(/[?&]sec_uid=([^&\s#]+)/);
    if (qM) return decodeURIComponent(qM[1]);
  } catch { /* ignore */ }
  return null;
}

// 从 URL 中提取视频 aweme_id
function extractAwemeId(url: string): string | null {
  const m = url.match(/\/video\/(\d+)/);
  return m ? m[1] : null;
}

// 跟随 HTTP 重定向，返回落地 URL（支持 iesdouyin.com/share/user/xxx）
async function resolveUrl(rawUrl: string, cookie: string): Promise<string> {
  try {
    const res = await fetch(rawUrl, {
      method: "HEAD",
      headers: {
        Cookie: cookie,
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1",
        Referer: "https://www.douyin.com/",
      },
      redirect: "follow",
    });
    const final = res.url || rawUrl;
    console.log("[resolveUrl]", rawUrl.slice(0, 50), "→", final.slice(0, 120));
    return final;
  } catch (e) {
    console.error("[resolveUrl] error:", (e as Error).message);
    return rawUrl;
  }
}

// 通过视频 aweme_id 获取作者 sec_uid
async function secUidFromAweme(
  awemeId: string,
  hdrs: Record<string, string>
): Promise<string | null> {
  try {
    const r = await fetch(
      `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&cookie_enabled=true&platform=PC`,
      { headers: hdrs }
    );
    const d = await r.json();
    return d?.aweme_detail?.author?.sec_uid ?? null;
  } catch (e) {
    console.error("[secUidFromAweme]", (e as Error).message);
    return null;
  }
}

const num = (n: unknown): number => (typeof n === "number" ? n : 0);

function generateMsToken(length = 32): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function buildHeaders(cookie: string): Record<string, string> {
  return {
    Cookie: cookie,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    Referer: "https://www.douyin.com/",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "zh-CN,zh;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Connection: "keep-alive",
    "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    "X-Requested-With": "XMLHttpRequest",
  };
}

// 后处理：清理 ASR 输出的常见伪影
function cleanTranscript(text: string): string {
  return text
    // 移除模型插入的音乐/音效标记（如 🎼、♪、♫ 等）
    .replace(/[\u2669-\u266D\u266F\u266A\u266B\u266C\u266E🎼🎵🎶🔊🔉🔇🎧🎤]/g, "")
    // 移除语言标记 SenseVoice 插入的 <|zh|> <|en|> <|xxx|> 等
    .replace(/<\|[^|]+\|>/g, "")
    // 移除时间戳类片段（如 [00:00:00] 或 (00:12)）
    .replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?/g, "")
    // 合并多余空格和换行
    .replace(/\s+/g, " ")
    .trim();
}

// 通过硅基流动 API 转写音频；engine 可选 'sensevoice' | 'telespeech'
async function transcribeWithSiliconFlow(
  audioData: ArrayBuffer,
  apiKey: string,
): Promise<string | null> {
  const model = "FunAudioLLM/SenseVoiceSmall";
  const formData = new FormData();
  formData.append("model", model);
  formData.append("file", new Blob([audioData], { type: "video/mp4" }), "audio.mp4");
  formData.append("language", "zh");
  formData.append("response_format", "text");

  const res = await fetch("https://api.siliconflow.cn/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    console.log("[transcribeWithSiliconFlow] failed:", res.status, err.slice(0, 200));
    return null;
  }

  const body = await res.text();
  let transcript = "";
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.text === "string") transcript = parsed.text.trim();
    else if (typeof parsed?.transcript === "string") transcript = parsed.transcript.trim();
  } catch { /* 纯文本 */ }
  if (!transcript) transcript = body.trim();

  transcript = cleanTranscript(transcript);
  console.log("[transcribeWithSiliconFlow] success, len:", transcript.length);
  return transcript.length > 0 ? transcript : null;
}

// 通过 Groq Whisper API 转写音频
async function transcribeWithGroq(
  audioData: ArrayBuffer,
  apiKey: string,
): Promise<string | null> {
  // Groq 文件大小限制 25MB
  const MAX_SIZE = 25 * 1024 * 1024;
  let sendData: ArrayBuffer = audioData;
  if (audioData.byteLength > MAX_SIZE) {
    console.log(`[transcribeWithGroq] 文件过大 (${audioData.byteLength} bytes)，截取前 25MB`);
    sendData = audioData.slice(0, MAX_SIZE);
  }

  const formData = new FormData();
  formData.append("model", "whisper-large-v3");
  formData.append("file", new Blob([sendData], { type: "video/mp4" }), "audio.mp4");
  formData.append("language", "zh");
  formData.append("response_format", "json");
  formData.append("temperature", "0");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });
  if (!res.ok) {
    const err = await res.text();
    console.log("[transcribeWithGroq] failed:", res.status, err.slice(0, 300));
    return null;
  }
  const body = await res.text();
  let transcript = "";
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.text === "string") transcript = parsed.text.trim();
  } catch {
    transcript = body.trim();
  }
  transcript = cleanTranscript(transcript);
  console.log("[transcribeWithGroq] success, len:", transcript.length);
  return transcript.length > 0 ? transcript : null;
}

// 通过 aweme_detail 接口获取单视频文案（subtitle 失败时的兜底文案源）
async function fetchAwemeDetailDesc(awemeId: string, hdrs: Record<string, string>): Promise<string> {
  try {
    const url = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${awemeId}&aid=6383&cookie_enabled=true&platform=PC`;
    const r = await fetch(url, { headers: hdrs });
    const text = await r.text();
    let d: any = {};
    try { d = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
    const desc = d?.aweme_detail?.desc ?? d?.aweme_detail?.title ?? "";
    console.log("[fetchAwemeDetailDesc] aweme:", awemeId, "desc_len:", desc.length);
    return typeof desc === "string" ? desc : "";
  } catch (e) {
    console.log("[fetchAwemeDetailDesc] error:", (e as Error).message);
    return "";
  }
}

// 从抖音视频详情页 HTML 中解析 aweme_detail（API 被风控时的兜底）
async function fetchVideoDetailFromHtml(awemeId: string, cookie: string): Promise<any | null> {
  try {
    const url = `https://www.douyin.com/video/${encodeURIComponent(awemeId)}`;
    const r = await fetch(url, {
      headers: buildHeaders(cookie),
      redirect: "follow",
    });
    const html = await r.text();
    console.log("[fetchVideoDetailFromHtml] status:", r.status, "len:", html.length);

    // 与 fetchWorksFromHtml 使用同样的 SSR 模式
    const patterns = [
      /<script[^>]*id="RENDER_DATA"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i,
      /<script[^>]*>window\._SSR_HYDRATED_DATA\s*=\s*([\s\S]*?)<\/script>/i,
    ];

    for (const pattern of patterns) {
      const m = html.match(pattern);
      if (!m) continue;
      try {
        const raw = m[1].trim();
        const decoded = raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x3D;/g, "=").replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/");
        const data = JSON.parse(decoded);
        // 递归查找 aweme_detail
        const findAwemeDetail = (obj: any): any | null => {
          if (!obj || typeof obj !== "object") return null;
          if (obj.aweme_detail || obj.awemeDetail) return obj.aweme_detail || obj.awemeDetail;
          if (Array.isArray(obj)) {
            for (const item of obj) {
              const found = findAwemeDetail(item);
              if (found) return found;
            }
            return null;
          }
          for (const key of Object.keys(obj)) {
            const found = findAwemeDetail(obj[key]);
            if (found) return found;
          }
          return null;
        };
        const detail = findAwemeDetail(data);
        if (detail) {
          console.log("[fetchVideoDetailFromHtml] parsed detail, has_video:", !!detail.video);
          return detail;
        }
      } catch (e) {
        console.log("[fetchVideoDetailFromHtml] parse error:", (e as Error).message);
      }
    }
    return null;
  } catch (e) {
    console.log("[fetchVideoDetailFromHtml] error:", (e as Error).message);
    return null;
  }
}

// 在对象树中递归查找第一个包含 aweme_id 的数组
function findAwemeList(obj: unknown): any[] {
  if (!obj || typeof obj !== "object") return [];
  if (Array.isArray(obj)) {
    if (obj.length > 0 && (obj[0]?.aweme_id || obj[0]?.awemeId || obj[0]?.id)) return obj;
    for (const item of obj) {
      const found = findAwemeList(item);
      if (found.length) return found;
    }
    return [];
  }
  for (const key of Object.keys(obj as Record<string, unknown>)) {
    const found = findAwemeList((obj as Record<string, unknown>)[key]);
    if (found.length) return found;
  }
  return [];
}

// 从抖音用户主页 HTML 中解析作品列表（API 被风控时的兜底）
async function fetchWorksFromHtml(secUid: string, cookie: string): Promise<Record<string, unknown>[]> {
  const homeUrl = `https://www.douyin.com/user/${encodeURIComponent(secUid)}`;
  const r = await fetch(homeUrl, {
    headers: buildHeaders(cookie),
    redirect: "follow",
  });
  const html = await r.text();
  console.log("[fetchWorksFromHtml] status:", r.status, "len:", html.length);

  // 尝试多种 SSR 数据格式
  const patterns = [
    /<script[^>]*id="RENDER_DATA"[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/i,
    /<script[^>]*>window\._SSR_HYDRATED_DATA\s*=\s*([\s\S]*?)<\/script>/i,
  ];

  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (!m) continue;
    try {
      const raw = m[1].trim();
      const decoded = raw.replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#x3D;/g, "=").replace(/&#x27;/g, "'").replace(/&#x2F;/g, "/");
      const data = JSON.parse(decoded);
      const list = findAwemeList(data);
      if (list.length > 0) {
        console.log("[fetchWorksFromHtml] parsed works:", list.length);
        return list.map((item: any) => ({
          douyin_aweme_id: String(item.aweme_id || item.awemeId || item.id),
          title: item.desc || item.title || "无标题",
          cover_url: item.video?.cover?.url_list?.[0] ?? item.video?.origin_cover?.url_list?.[0] ?? item.coverUrl ?? null,
          video_url: `https://www.douyin.com/video/${item.aweme_id || item.awemeId || item.id}`,
          publish_time: item.create_time ? new Date(item.create_time * 1000).toISOString() : null,
          like_count: num(item.statistics?.digg_count ?? item.diggCount),
          comment_count: num(item.statistics?.comment_count ?? item.commentCount),
          share_count: num(item.statistics?.share_count ?? item.shareCount),
          collect_count: num(item.statistics?.collect_count ?? item.collectCount),
          duration: Math.round(item.video?.duration ?? 0),
          subtitle_url: item.video?.subtitle_infos?.[0]?.url ?? null,
        }));
      }
    } catch (e) {
      console.log("[fetchWorksFromHtml] parse error:", (e as Error).message);
    }
  }

  return [];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const body = await req.json();
    const { action, url, sec_uid, cookie } = body;
    console.log("[douyin-fetch] action:", action, "url:", (url ?? "").slice(0, 60), "has_cookie:", !!cookie);

    const COOKIE: string = cookie || Deno.env.get("DOUYIN_COOKIE") || "";
    if (!COOKIE) return fail("未配置抖音 Cookie，请在设置页填写");

    const hdrs = buildHeaders(COOKIE);
    const msToken = generateMsToken();

    // ── 获取博主信息 ─────────────────────────────────────
    if (action === "get_user_info") {
      let uid: string | null = sec_uid || null;

      if (!uid && url) {
        // 1. 从输入文本提取 URL
        const rawUrl = extractUrl(url as string);
        console.log("[get_user_info] rawUrl:", rawUrl?.slice(0, 80));
        if (!rawUrl) return fail("未找到链接，请粘贴含链接的分享文本或主页链接");

        // 2. 直接尝试从 rawUrl 提取（长链 douyin.com/user/xxx）
        uid = extractSecUid(rawUrl);

        // 3. 短链/未提取到 → 跟随重定向（落地到 iesdouyin.com/share/user/xxx 或 douyin.com/user/xxx）
        if (!uid) {
          const resolved = await resolveUrl(rawUrl, COOKIE);
          uid = extractSecUid(resolved);
          // 4. 视频链接 → 通过 aweme_detail 拿作者
          if (!uid) {
            const awemeId = extractAwemeId(resolved);
            if (awemeId) uid = await secUidFromAweme(awemeId, hdrs);
          }
        }

        console.log("[get_user_info] resolved sec_uid:", uid?.slice(0, 30));
      }

      if (!uid) return fail("无法解析博主 ID，请直接复制抖音主页链接（douyin.com/user/xxx）");

      const apiUrl = `https://www.douyin.com/aweme/v1/web/user/profile/other/?sec_user_id=${encodeURIComponent(uid)}&aid=6383&cookie_enabled=true&platform=PC&downlink=10&msToken=${msToken}`;
      const r = await fetch(apiUrl, { headers: hdrs });
      const d = await r.json();
      console.log("[get_user_info] API status:", r.status, "has_user:", !!d?.user);

      if (!d?.user) {
        return fail(
          `获取博主信息失败（status=${r.status}），Cookie 可能已过期。响应：${JSON.stringify(d).slice(0, 300)}`
        );
      }

      const u = d.user;
      return ok({
        douyin_user_id: u.uid || u.sec_uid,
        sec_uid: u.sec_uid,
        nickname: u.nickname,
        avatar_url: u.avatar_larger?.url_list?.[0] ?? u.avatar_thumb?.url_list?.[0] ?? null,
        bio: u.signature ?? "",
        follower_count: num(u.follower_count),
        total_works: num(u.aweme_count),
      });
    }

    // ── 获取视频逐字稿（字幕优先，实时拉取播放地址 → Groq 兜底） ──
    if (action === "get_subtitle") {
      const { aweme_id, work_id, groq_api_key } = body;
      if (!aweme_id && !work_id) return fail("缺少 aweme_id 或 work_id 参数");

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
      const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

      // Step 1: 从 DB 读取 work + blogger sec_uid（用于实时拉取）
      const query = aweme_id
        ? `douyin_aweme_id=eq.${encodeURIComponent(aweme_id)}`
        : `id=eq.${encodeURIComponent(work_id)}`;
      const dbRes = await fetch(
        `${SUPABASE_URL}/rest/v1/works?${query}&select=id,douyin_aweme_id,title,subtitle_url,blogger_id&limit=1`,
        { headers: dbHeaders(SERVICE_KEY) },
      );
      const dbRows = await dbRes.json();
      const workRow = Array.isArray(dbRows) ? dbRows[0] : null;
      const targetAwemeId: string = workRow?.douyin_aweme_id ?? aweme_id;
      const desc: string = workRow?.title ?? "";
      console.log("[get_subtitle] work:", targetAwemeId, "subtitle_url:", workRow?.subtitle_url?.slice(0, 50) ?? "null");

      // 解析 SRT → 纯文字工具函数
      const parseSrt = (srt: string): string => {
        const lines = srt.split(/\r?\n/);
        const out: string[] = [];
        for (const line of lines) {
          const t = line.trim();
          if (!t || /^\d+$/.test(t) || t.includes("-->")) continue;
          out.push(t);
        }
        return out.join("").replace(/\s+/g, " ").trim();
      };

      // 尝试从 URL 下载并解析 SRT
      const tryParseSrtUrl = async (url: string): Promise<string | null> => {
        try {
          const r = await fetch(url);
          if (!r.ok) return null;
          const txt = await r.text();
          const parsed = parseSrt(txt);
          return parsed.length > 5 ? parsed : null;
        } catch { return null; }
      };

      // Step 2: 先用 DB 里已存的 subtitle_url 试一次
      if (workRow?.subtitle_url) {
        const content = await tryParseSrtUrl(workRow.subtitle_url);
        if (content) {
          console.log("[get_subtitle] DB subtitle hit, len:", content.length);
          return ok({ content, word_count: content.replace(/\s/g, "").length, source: "subtitle" });
        }
        console.log("[get_subtitle] DB subtitle expired or invalid, refreshing...");
      }

      // Step 3: 实时拉取博主作品列表，找到该 aweme，获取新鲜 subtitle_infos + play_addr
      let freshSubUrl: string | null = null;
      let freshPlayUrl: string | null = null;

      if (workRow?.blogger_id) {
        const bloggerRes = await fetch(
          `${SUPABASE_URL}/rest/v1/bloggers?id=eq.${encodeURIComponent(workRow.blogger_id)}&select=sec_uid&limit=1`,
          { headers: dbHeaders(SERVICE_KEY) },
        );
        const bloggerRows = await bloggerRes.json();
        const secUid: string | null = Array.isArray(bloggerRows) ? bloggerRows[0]?.sec_uid ?? null : null;

        if (secUid) {
          console.log("[get_subtitle] refreshing list for sec_uid:", secUid.slice(0, 30));
          let cursor = 0;
          let found = false;
          try {
            for (let page = 0; page < 5 && !found; page++) {
              const listUrl = `https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=${encodeURIComponent(secUid)}&count=20&max_cursor=${cursor}&aid=6383&cookie_enabled=true&platform=PC&msToken=${msToken}`;
              const lr = await fetch(listUrl, { headers: hdrs });
              const text = await lr.text();
              let ld: any = {};
              try { ld = text ? JSON.parse(text) : {}; } catch { /* ignore */ }
              console.log(`[get_subtitle] post list page ${page + 1} status:`, lr.status, "has_list:", Array.isArray(ld?.aweme_list), "list_len:", ld?.aweme_list?.length ?? 0);
              for (const item of (ld?.aweme_list ?? [])) {
                if (String(item.aweme_id) === String(targetAwemeId)) {
                  // 找到了目标作品
                  const subs: Array<{ url?: string; language_code?: string }> = item.video?.subtitle_infos ?? [];
                  const sub = subs.find((s) => s.language_code === "zh" || s.language_code === "chi") ?? subs[0];
                  freshSubUrl = sub?.url ?? null;
                  // 播放地址列表
                  const playList: string[] = item.video?.play_addr?.url_list ?? item.video?.download_addr?.url_list ?? [];
                  freshPlayUrl = playList[0] ?? null;
                  console.log("[get_subtitle] found in list, freshSub:", !!freshSubUrl, "freshPlay:", !!freshPlayUrl);
                  // 更新 DB subtitle_url + play_url
                  if (workRow?.id) {
                    const patchHeaders = { ...dbHeaders(SERVICE_KEY), "Content-Type": "application/json", Prefer: "return=minimal" };
                    await fetch(`${SUPABASE_URL}/rest/v1/works?id=eq.${encodeURIComponent(workRow.id)}`, {
                      method: "PATCH",
                      headers: patchHeaders,
                      body: JSON.stringify({ subtitle_url: freshSubUrl, play_url: freshPlayUrl, updated_at: new Date().toISOString() }),
                    });
                  }
                  found = true;
                  break;
                }
              }
              if (!ld?.has_more || found) break;
              cursor = ld.max_cursor ?? 0;
            }
          } catch (listErr) {
            console.log("[get_subtitle] post list error:", (listErr as Error).message);
          }
        }
      }

      // Step 3.5: 如果列表刷新没找到字幕/播放地址，直接从 aweme/detail 接口获取
      if ((!freshSubUrl || !freshPlayUrl) && targetAwemeId) {
        try {
          const detailUrl = `https://www.douyin.com/aweme/v1/web/aweme/detail/?aweme_id=${targetAwemeId}&aid=6383&cookie_enabled=true&platform=PC`;
          const detailRes = await fetch(detailUrl, { headers: hdrs });
          const detailText = await detailRes.text();
          let detailData: any = {};
          try { detailData = detailText ? JSON.parse(detailText) : {}; } catch { /* ignore */ }
          console.log("[get_subtitle] aweme/detail status:", detailRes.status, "has_detail:", !!detailData?.aweme_detail);
          const detailSubs: Array<{ url?: string; language_code?: string }> =
            detailData?.aweme_detail?.video?.subtitle_infos ?? [];
          const detailSub = detailSubs.find((s) => s.language_code === "zh" || s.language_code === "chi") ?? detailSubs[0];
          if (detailSub?.url) {
            freshSubUrl = detailSub.url;
            console.log("[get_subtitle] aweme/detail subtitle found");
          }
          if (!freshPlayUrl) {
            const playList: string[] = detailData?.aweme_detail?.video?.play_addr?.url_list ??
              detailData?.aweme_detail?.video?.download_addr?.url_list ?? [];
            freshPlayUrl = playList[0] ?? null;
            if (freshPlayUrl) console.log("[get_subtitle] play_url from aweme/detail");
          }
        } catch (e) {
          console.log("[get_subtitle] aweme/detail error:", (e as Error).message);
        }
      }

      // Step 3.6: API 被风控/失败时，从视频详情页 HTML 解析 SSR 数据兜底
      if ((!freshSubUrl || !freshPlayUrl) && targetAwemeId && COOKIE) {
        console.log("[get_subtitle] trying HTML fallback for aweme:", targetAwemeId);
        const htmlDetail = await fetchVideoDetailFromHtml(targetAwemeId, COOKIE);
        if (htmlDetail) {
          const htmlSubs: Array<{ url?: string; language_code?: string }> = htmlDetail.video?.subtitle_infos ?? [];
          const htmlSub = htmlSubs.find((s) => s.language_code === "zh" || s.language_code === "chi") ?? htmlSubs[0];
          if (htmlSub?.url && !freshSubUrl) {
            freshSubUrl = htmlSub.url;
            console.log("[get_subtitle] HTML fallback subtitle found");
          }
          if (!freshPlayUrl) {
            const playList: string[] = htmlDetail.video?.play_addr?.url_list ??
              htmlDetail.video?.download_addr?.url_list ?? [];
            freshPlayUrl = playList[0] ?? null;
            if (freshPlayUrl) console.log("[get_subtitle] play_url from HTML fallback");
          }
          // 顺手把详情页解析到的 subtitle/play_url 写回 DB
          if (workRow?.id) {
            const patchHeaders = { ...dbHeaders(SERVICE_KEY), "Content-Type": "application/json", Prefer: "return=minimal" };
            await fetch(`${SUPABASE_URL}/rest/v1/works?id=eq.${encodeURIComponent(workRow.id)}`, {
              method: "PATCH",
              headers: patchHeaders,
              body: JSON.stringify({ subtitle_url: freshSubUrl, play_url: freshPlayUrl, updated_at: new Date().toISOString() }),
            });
          }
        }
      }

      // Step 4: 解析字幕
      if (freshSubUrl) {
        const content = await tryParseSrtUrl(freshSubUrl);
        if (content) {
          console.log("[get_subtitle] fresh subtitle hit, len:", content.length);
          return ok({ content, word_count: content.replace(/\s/g, "").length, source: "subtitle" });
        }
      }

      // Step 5: 有播放地址 → 语音识别（硅基流动 / Groq）
      const sfKey: string = body.siliconflow_api_key || Deno.env.get("SILICONFLOW_API_KEY") || "";
      const groqKey: string = body.groq_api_key || Deno.env.get("GROQ_API_KEY") || "";
      if (freshPlayUrl && (sfKey || groqKey)) {
        // Groq 限制 25MB，硅基流动限制更大 → 根据可用 key 取最小值
        const maxDownload = groqKey ? 25 * 1024 * 1024 : 50 * 1024 * 1024;
        console.log("[get_subtitle] trying ASR, playUrl:", freshPlayUrl.slice(0, 80), "hasSF:", !!sfKey, "hasGroq:", !!groqKey, "maxSize:", maxDownload);
        try {
          // 先 HEAD 请求获取文件总大小
          let totalSize = maxDownload;
          try {
            const headRes = await fetch(freshPlayUrl, { method: "HEAD", headers: hdrs });
            const contentLen = headRes.headers.get("content-length");
            if (contentLen) totalSize = Math.min(parseInt(contentLen, 10), maxDownload);
          } catch {}
          const audioRes = await fetch(freshPlayUrl, {
            headers: { ...hdrs, "Range": `bytes=0-${totalSize - 1}` },
          });
          if (audioRes.ok || audioRes.status === 206) {
            const audioData = await audioRes.arrayBuffer();
            console.log("[get_subtitle] audio downloaded, size:", audioData.byteLength);
            // 优先 Groq（更快），回退硅基流动
            let transcript: string | null = null;
            let source = "";
            if (groqKey) {
              transcript = await transcribeWithGroq(audioData, groqKey);
              if (transcript) source = "groq";
            }
            if (!transcript && sfKey) {
              transcript = await transcribeWithSiliconFlow(audioData, sfKey);
              if (transcript) source = "siliconflow";
            }
            if (transcript && transcript.length > 5) {
              if (workRow?.id) {
                const postHeaders = { ...dbHeaders(SERVICE_KEY), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates" };
                await fetch(`${SUPABASE_URL}/rest/v1/transcripts`, {
                  method: "POST",
                  headers: postHeaders,
                  body: JSON.stringify({ work_id: workRow.id, content: transcript, word_count: transcript.replace(/\s/g, "").length }),
                });
              }
              return ok({ content: transcript, word_count: transcript.replace(/\s/g, "").length, source });
            }
          }
        } catch (se) {
          console.log("[get_subtitle] ASR error:", (se as Error).message);
        }
      }

      // Step 6: 兜底返回视频描述（优先实时拉取 aweme_detail，失败再用 DB 里的 title）
      console.log("[get_subtitle] fallback to desc");
      const detailDesc = targetAwemeId ? await fetchAwemeDetailDesc(targetAwemeId, hdrs) : "";
      const finalDesc = detailDesc || desc || "暂无文案";
      let noSubMsg = "";
      if (finalDesc === "暂无文案") {
        noSubMsg = "未能获取到该视频文案，请检查抖音 Cookie 是否有效。";
      } else if (!sfKey) {
        noSubMsg = "该视频暂无内置字幕。已返回视频文案/描述作为兜底，如需完整逐字稿请在设置中配置硅基流动 API Key。";
      } else if (!freshPlayUrl) {
        noSubMsg = "未能获取到视频播放地址，可能是抖音 Cookie 已过期或该视频受限。已返回视频文案/描述作为兜底，建议重新配置抖音 Cookie 后再试。";
      } else {
        noSubMsg = "该视频无内置字幕，语音识别未能成功。已返回视频文案/描述作为兜底。";
      }
      return ok({
        content: finalDesc,
        word_count: finalDesc.replace(/\s/g, "").length,
        source: "desc",
        message: noSubMsg,
      });
    }


    if (action === "get_works") {
      if (!sec_uid) return fail("缺少 sec_uid 参数");

      const works: Record<string, unknown>[] = [];
      let cursor = 0;
      let hasMore = true;
      let page = 0;
      let apiFailed = false;

      while (hasMore && works.length < 100 && page < 5) {
        page++;
        const apiUrl = `https://www.douyin.com/aweme/v1/web/aweme/post/?sec_user_id=${encodeURIComponent(sec_uid)}&count=20&max_cursor=${cursor}&aid=6383&cookie_enabled=true&platform=PC&msToken=${msToken}`;
        const r = await fetch(apiUrl, { headers: hdrs });
        const text = await r.text();
        let d: any = {};
        try {
          d = JSON.parse(text);
        } catch {
          console.log("[get_works] page", page, "non-JSON response:", text.slice(0, 200));
          apiFailed = true;
          break;
        }
        console.log("[get_works] page", page, "status:", r.status, "count:", d?.aweme_list?.length ?? 0);

        if (!d.aweme_list?.length) {
          if (d.status_code !== 0 && d.status_code !== undefined) {
            apiFailed = true;
          }
          break;
        }

        for (const item of d.aweme_list) {
          if (works.length >= 100) break;
          // 字幕 URL：优先中文，其次第一个
          const subs: Array<{ url?: string; language_code?: string }> =
            item.video?.subtitle_infos ?? [];
          const subItem =
            subs.find((s) => s.language_code === "zh" || s.language_code === "chi") ?? subs[0];
          works.push({
            aweme_id: String(item.aweme_id),
            douyin_aweme_id: String(item.aweme_id),
            title: item.desc || "无标题",
            cover_url:
              item.video?.cover?.url_list?.[0] ?? item.video?.origin_cover?.url_list?.[0] ?? null,
            video_url: `https://www.douyin.com/video/${item.aweme_id}`,
            play_url: item.video?.play_addr?.url_list?.[0] ?? item.video?.download_addr?.url_list?.[0] ?? null,
            publish_time: item.create_time
              ? new Date(item.create_time * 1000).toISOString()
              : null,
            like_count: num(item.statistics?.digg_count),
            comment_count: num(item.statistics?.comment_count),
            share_count: num(item.statistics?.share_count),
            collect_count: num(item.statistics?.collect_count),
            duration: Math.round(item.video?.duration ?? 0),
            subtitle_url: subItem?.url ?? null,
          });
        }

        hasMore = d.has_more === 1;
        cursor = d.max_cursor ?? 0;
        if (!hasMore) break;
      }

      // API 被风控/失败时，尝试从用户主页 HTML 解析
      if ((apiFailed || works.length === 0) && sec_uid) {
        console.log("[get_works] trying HTML fallback for sec_uid:", sec_uid.slice(0, 30));
        const htmlWorks = await fetchWorksFromHtml(sec_uid as string, COOKIE);
        if (htmlWorks.length > 0) {
          return ok({ works: htmlWorks, total: htmlWorks.length, source: "html" });
        }
      }

      return ok({ works, total: works.length });
    }

    return fail("未知操作类型");
  } catch (e) {
    const msg = (e as Error).message;
    console.error("[douyin-fetch] uncaught:", msg);
    return fail(`服务器错误: ${msg}`);
  }
});
