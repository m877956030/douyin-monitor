// Supabase API 调用封装
import { supabase } from '@/client/supabase';
import type { Blogger, Work, Category, Transcript, AiAnalysis, AiConfig, AiProvider, WritingTemplate, AiAnalysisContent } from './types';
import { FileSystem, EncodingType } from 'expo-file-system';

const EDGE_BASE = process.env.EXPO_PUBLIC_SUPABASE_URL + '/functions/v1';

// ─── Cookie 设置 ─────────────────────────────────────────────
export async function getDouyinCookie(): Promise<string> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'douyin_cookie')
    .maybeSingle();
  return data?.value || '';
}

export async function saveDouyinCookie(cookie: string) {
  await supabase
    .from('app_settings')
    .upsert({ key: 'douyin_cookie', value: cookie, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ─── 硅基流动 Key ───────────────────────────────────────────
export async function getSiliconFlowKey(): Promise<string> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'siliconflow_api_key')
    .maybeSingle();
  return data?.value || '';
}

export async function saveSiliconFlowKey(key: string) {
  await supabase
    .from('app_settings')
    .upsert({ key: 'siliconflow_api_key', value: key, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ─── Groq Key ──────────────────────────────────────────────────
export async function getGroqKey(): Promise<string> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'groq_api_key')
    .maybeSingle();
  return data?.value || '';
}

export async function saveGroqKey(key: string) {
  await supabase
    .from('app_settings')
    .upsert({ key: 'groq_api_key', value: key, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ─── 联网搜索 Key（Tavily）────────────────────────────────────
export async function getWebSearchKey(): Promise<string> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', 'web_search_api_key')
    .maybeSingle();
  return data?.value || '';
}

export async function saveWebSearchKey(key: string) {
  await supabase
    .from('app_settings')
    .upsert({ key: 'web_search_api_key', value: key, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

export async function testGroqConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      const err = await res.text().catch(() => '');
      return { success: false, error: `Groq 返回 ${res.status}: ${err.slice(0, 100)}` };
    }
    return { success: true };
  } catch (e: unknown) {
    return { success: false, error: e instanceof Error ? e.message : '连接失败' };
  }
}

// ─── AI 配音工具 Cookie ────────────────────────────────────
export type AiVoiceToolKey = 'voxcpm2_cookie' | 'indextts2_cookie';

export async function getAiVoiceCookie(key: AiVoiceToolKey): Promise<string> {
  const { data } = await supabase
    .from('app_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  return data?.value || '';
}

export async function saveAiVoiceCookie(key: AiVoiceToolKey, cookie: string) {
  await supabase
    .from('app_settings')
    .upsert({ key, value: cookie, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

// ─── 统一 Edge Function 调用（原生 fetch，绕过 SDK 兼容性问题）──
async function callEdgeFunction(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const funcUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/douyin-fetch`;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  // 超时控制：2 分钟（Edge Function 处理视频转录可能需要较长时间）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 120000);

  try {
    const httpRes = await fetch(funcUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        'apikey': anonKey || '',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!httpRes.ok) {
      const errText = await httpRes.text().catch(() => '');
      throw new Error(`服务器返回 ${httpRes.status}: ${errText.slice(0, 200)}`);
    }

    const text = await httpRes.text();

    // 空响应检测（Edge Function 超时时可能返回空 body）
    if (!text || text.trim() === '') {
      throw new Error('服务器返回空响应，可能是处理超时。请尝试使用本地模式转录。');
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`服务器返回格式异常: ${text.slice(0, 200)}`);
    }
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('请求超时（2分钟），服务器处理时间过长。请尝试使用本地模式转录。');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 博主相关 ───────────────────────────────────────────────
export async function fetchBloggerInfo(url: string) {
  const cookie = await getDouyinCookie();
  const data = await callEdgeFunction({ action: 'get_user_info', url, cookie });
  if (data.error) throw new Error(data.error as string);
  return data;
}

export async function saveBlogger(data: {
  douyin_user_id: string;
  sec_uid?: string;
  nickname: string;
  avatar_url: string | null;
  bio: string;
  follower_count: number;
  total_works: number;
  home_url: string;
}): Promise<Blogger> {
  // 只保留表中存在的字段（sec_uid 列已添加）
  const row = {
    douyin_user_id: data.douyin_user_id,
    sec_uid: data.sec_uid ?? null,
    nickname: data.nickname,
    avatar_url: data.avatar_url,
    bio: data.bio,
    follower_count: data.follower_count,
    total_works: data.total_works,
    home_url: data.home_url,
  };

  const { data: existing } = await supabase
    .from('bloggers')
    .select('id')
    .eq('douyin_user_id', row.douyin_user_id)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase
      .from('bloggers')
      .update({ ...row, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  }

  const { data: created, error } = await supabase
    .from('bloggers')
    .insert(row)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created;
}

export async function getBloggers(): Promise<Blogger[]> {
  const { data, error } = await supabase
    .from('bloggers')
    .select('*, blogger_categories(category_id, categories(id, name))')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data || []).map((b) => ({
    ...b,
    categories: b.blogger_categories?.map((bc: { categories: Category }) => bc.categories) || [],
  }));
}

export async function deleteBlogger(id: string) {
  const { error } = await supabase.from('bloggers').delete().eq('id', id);
  if (error) throw error;
}

// ─── 分类相关 ───────────────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function createCategory(name: string): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({ name })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(id: string, name: string) {
  const { error } = await supabase.from('categories').update({ name }).eq('id', id);
  if (error) throw error;
}

export async function deleteCategory(id: string) {
  const { error } = await supabase.from('categories').delete().eq('id', id);
  if (error) throw error;
}

export async function assignBloggerCategory(bloggerId: string, categoryId: string) {
  await supabase
    .from('blogger_categories')
    .upsert({ blogger_id: bloggerId, category_id: categoryId });
}

export async function removeBloggerCategory(bloggerId: string, categoryId: string) {
  await supabase
    .from('blogger_categories')
    .delete()
    .eq('blogger_id', bloggerId)
    .eq('category_id', categoryId);
}

// ─── 作品相关 ───────────────────────────────────────────────
export async function fetchAndSaveWorks(bloggerId: string, secUid: string): Promise<Work[]> {
  const cookie = await getDouyinCookie();
  const data = await callEdgeFunction({ action: 'get_works', sec_uid: secUid, cookie, blogger_id: bloggerId });
  if (data.error) throw new Error(data.error as string);

  const works = (data.works as Record<string, unknown>[]) || [];
  if (works.length === 0) return [];

  // Upsert 作品数据（过滤掉数据库不存在的列）
  const allowedColumns = ['douyin_aweme_id', 'title', 'cover_url', 'video_url', 'subtitle_url',
    'publish_time', 'like_count', 'comment_count', 'share_count', 'collect_count', 'duration', 'play_url'];
  const upsertData = works.map((w: Record<string, unknown>) => {
    const clean: Record<string, unknown> = { blogger_id: bloggerId, updated_at: new Date().toISOString() };
    for (const col of allowedColumns) {
      if (w[col] !== undefined) clean[col] = w[col];
    }
    return clean;
  });

  const { error } = await supabase
    .from('works')
    .upsert(upsertData, { onConflict: 'douyin_aweme_id' });
  if (error) throw new Error(error.message);

  return getWorks(bloggerId);
}

export async function getWorks(bloggerId: string): Promise<Work[]> {
  const { data, error } = await supabase
    .from('works')
    .select('*')
    .eq('blogger_id', bloggerId)
    .order('publish_time', { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getWork(workId: string): Promise<Work | null> {
  const { data, error } = await supabase
    .from('works')
    .select('*, blogger:bloggers(*)')
    .eq('id', workId)
    .single();
  if (error) return null;
  return data;
}

// ─── 文案转写 ───────────────────────────────────────────────
export async function getTranscript(workId: string): Promise<Transcript | null> {
  const { data } = await supabase
    .from('transcripts')
    .select('*')
    .eq('work_id', workId)
    .maybeSingle();
  return data;
}

// 本地转录服务器设置
export async function getLocalServerConfig(): Promise<{ host: string; port: number; engine: string }> {
  const [{ data: host }, { data: port }, { data: engine }] = await Promise.all([
    supabase.from('app_settings').select('value').eq('key', 'local_server_host').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'local_server_port').maybeSingle(),
    supabase.from('app_settings').select('value').eq('key', 'local_transcribe_engine').maybeSingle(),
  ]);
  return {
    host: host?.value || '',
    port: parseInt(port?.value || '3000', 10),
    engine: engine?.value || 'siliconflow',
  };
}

export async function saveLocalServerHost(host: string) {
  await supabase.from('app_settings').upsert(
    { key: 'local_server_host', value: host, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

export async function saveLocalServerPort(port: string) {
  await supabase.from('app_settings').upsert(
    { key: 'local_server_port', value: port, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

export async function saveLocalTranscribeEngine(engine: string) {
  await supabase.from('app_settings').upsert(
    { key: 'local_transcribe_engine', value: engine, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );
}

// 检测本地服务器是否在线
export async function pingLocalServer(host: string, port: number): Promise<boolean> {
  if (!host) return false;
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 3000);
    const res = await fetch(`http://${host}:${port}/ping`, { method: 'GET', signal: ac.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

// 本地转录（接口二：FFmpeg + 本地服务器）
export async function fetchTranscriptLocal(
  videoUrl: string,
  apiKey: string,
  serverHost: string,
  serverPort: number,
  douyinCookie?: string,
  engine?: string,
): Promise<string> {
  if (!serverHost) throw new Error('未配置本地服务器地址，请在设置中填写');
  const url = `http://${serverHost}:${serverPort}/transcribe`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ videoUrl, apiKey, cookie: douyinCookie || '', engine: engine || 'siliconflow' }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `服务器返回 ${res.status}，请确认电脑端转录服务已启动`);
  }
  const data = await res.json();
  if (!data.content) throw new Error('转录返回内容为空');
  return data.content;
}

export async function fetchTranscript(
  workId: string,
  videoUrl: string,
  awemeId: string,
  siliconflowKey?: string,
  groqKey?: string,
): Promise<Transcript> {
  // 优先字幕 → 语音识别（Groq > 硅基流动）→ 视频描述
  const cookie = await getDouyinCookie();
  const sfKey = siliconflowKey || await getSiliconFlowKey();
  const gKey = groqKey || await getGroqKey();

  // 用原生 fetch 调 Edge Function（已替换 supabase.functions.invoke）
  const edgeData = await callEdgeFunction({
    action: 'get_subtitle',
    aweme_id: awemeId,
    work_id: workId,
    cookie,
    siliconflow_api_key: sfKey,
    groq_api_key: gKey,
  });

  if (edgeData.error) throw new Error(edgeData.error as string);

  const { content, word_count } = edgeData as { content: string; word_count: number };

  const { data: existing } = await supabase
    .from('transcripts')
    .select('id')
    .eq('work_id', workId)
    .maybeSingle();

  if (existing) {
    const { data: updated, error } = await supabase
      .from('transcripts')
      .update({ content, word_count, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return updated;
  }

  const { data: created, error } = await supabase
    .from('transcripts')
    .insert({ work_id: workId, content, word_count })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return created;
}

// ─── AI分析 ─────────────────────────────────────────────────
export async function getAiAnalysis(workId: string): Promise<AiAnalysis | null> {
  const { data } = await supabase
    .from('ai_analyses')
    .select('*')
    .eq('work_id', workId)
    .maybeSingle();
  return data;
}

export async function generateAiAnalysis(
  workId: string,
  content: string,
  config: AiConfig,
): Promise<AiAnalysis> {
  const res = await supabase.functions.invoke('ai-service', {
    body: {
      action: 'analyze',
      api_key: config.api_key,
      api_endpoint: config.api_endpoint,
      model: config.selected_model,
      content,
    },
  });
  if (res.error) throw new Error(res.error.message);
  if (res.data?.error) throw new Error(res.data.error);

  const analysis: AiAnalysisContent = res.data?.analysis || {};

  const { data: existing } = await supabase
    .from('ai_analyses')
    .select('id')
    .eq('work_id', workId)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('ai_analyses')
      .update({ content: analysis, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  const { data, error } = await supabase
    .from('ai_analyses')
    .insert({ work_id: workId, content: analysis })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── AI Chat ─────────────────────────────────────────────────
export async function aiChat(
  messages: { role: string; content: string | unknown[] }[],
  config: AiConfig,
  options?: { webSearch?: boolean; webSearchKey?: string },
): Promise<string> {
  const funcUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/ai-service`;
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  // 超时控制：60 秒（联网搜索需要更长时间）
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);

  try {
    const httpRes = await fetch(funcUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
        'apikey': anonKey || '',
      },
      body: JSON.stringify({
        action: 'chat',
        api_key: config.api_key,
        api_endpoint: config.api_endpoint,
        model: config.selected_model,
        messages,
        web_search: options?.webSearch || false,
        web_search_key: options?.webSearchKey || '',
      }),
      signal: controller.signal,
    });

    if (!httpRes.ok) {
      const errText = await httpRes.text().catch(() => '');
      // Edge Function 返回的错误通常包含详细的 JSON
      let errMsg = `AI 服务返回 ${httpRes.status}`;
      try {
        const errJson = JSON.parse(errText);
        if (errJson.error) errMsg = errJson.error;
      } catch { errMsg += `: ${errText.slice(0, 200)}`; }

      // 提供更友好的错误提示
      if (httpRes.status === 413) {
        errMsg = '请求数据过大（图片可能太大），请压缩后重试';
      } else if (httpRes.status === 400 && errText.includes('联网搜索')) {
        errMsg = '联网搜索需要在设置页配置 Tavily API Key';
      }

      throw new Error(errMsg);
    }

    const text = await httpRes.text();
    if (!text || text.trim() === '') throw new Error('AI 服务返回空响应');

    const data = JSON.parse(text);
    if (data.error) throw new Error(data.error);
    return data.reply || '';
  } catch (e: unknown) {
    if (e instanceof Error && e.name === 'AbortError') {
      throw new Error('AI 请求超时（30秒），请检查网络或模型响应速度');
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// ─── 文件上传到 Supabase Storage ──────────────────────────────
// 将设备上的文件上传到 Supabase Storage 并返回公共访问 URL
const BUCKET_NAME = 'ai-uploads';

export async function uploadFile(
  uri: string,
  fileName: string,
  mimeType: string,
): Promise<string> {
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
  const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

  // 生成唯一路径
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = `uploads/${Date.now()}_${safeName}`;

  // 读取文件为 base64（无论是否上传成功，先读取）
  const base64Data = await FileSystem.readAsStringAsync(uri, {
    encoding: EncodingType.Base64,
  });

  // 方案一：通过 Edge Function 代理上传（有 Service Role Key 权限）
  try {
    const proxyUrl = `${supabaseUrl}/functions/v1/ai-service`;
    const proxyRes = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'upload_file',
        bucket: BUCKET_NAME,
        file_path: filePath,
        file_base64: base64Data,
        content_type: mimeType,
      }),
    });
    if (proxyRes.ok) {
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);
      return publicUrl;
    }
  } catch {
    // 代理失败，尝试方案二
  }

  // 方案二：直接通过 REST API 上传（需要桶有正确的 RLS 策略）
  try {
    const uploadUrl = `${supabaseUrl}/storage/v1/object/${BUCKET_NAME}/${filePath}`;
    const binaryStr = atob(base64Data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
    const res = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${anonKey}`,
        'Content-Type': mimeType,
        'x-upsert': 'true',
      },
      body: bytes.buffer,
    });
    if (res.ok) {
      const { data: { publicUrl } } = supabase.storage
        .from(BUCKET_NAME)
        .getPublicUrl(filePath);
      return publicUrl;
    }
  } catch {
    // REST 上传失败，回退到 inline
  }

  // 方案三：都失败，回退到 inline base64 data URI
  console.warn('Storage 上传均失败，回退到 inline base64');
  return `data:${mimeType};base64,${base64Data}`;
}

// ─── AI多提供商配置 ───────────────────────────────────────────
export async function getAiProviders(): Promise<AiProvider[]> {
  const { data } = await supabase
    .from('ai_providers')
    .select('*')
    .order('sort_order', { ascending: true });
  return data || [];
}

export async function getActiveAiProvider(): Promise<AiProvider | null> {
  const { data } = await supabase
    .from('ai_providers')
    .select('*')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();
  return data;
}

export async function saveAiProvider(
  provider: Omit<AiProvider, 'id' | 'created_at' | 'updated_at'>,
  id?: string,
): Promise<AiProvider> {
  if (id) {
    const { data, error } = await supabase
      .from('ai_providers')
      .update({ ...provider, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from('ai_providers')
    .insert({ ...provider, updated_at: new Date().toISOString() })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function setActiveAiProvider(id: string): Promise<void> {
  // 先全部取消激活，再激活目标
  await supabase.from('ai_providers').update({ is_active: false }).neq('id', '00000000-0000-0000-0000-000000000000');
  await supabase.from('ai_providers').update({ is_active: true }).eq('id', id);
}

export async function deleteAiProvider(id: string): Promise<void> {
  const { error } = await supabase.from('ai_providers').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── 写作风格模板 ────────────────────────────────────────────
export async function getWritingTemplates(): Promise<WritingTemplate[]> {
  const { data } = await supabase
    .from('writing_templates')
    .select('*')
    .order('sort_order', { ascending: true });
  return data || [];
}

export async function saveWritingTemplate(
  template: Pick<WritingTemplate, 'name' | 'content'>,
  id?: string,
): Promise<WritingTemplate> {
  if (id) {
    const { data, error } = await supabase
      .from('writing_templates')
      .update(template)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabase
    .from('writing_templates')
    .insert(template)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function deleteWritingTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('writing_templates').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ─── AI配置（兼容旧逻辑，读取激活的 provider） ──────────────
export async function getAiConfig(): Promise<AiConfig | null> {
  // 优先从 ai_providers 读取激活配置
  const provider = await getActiveAiProvider();
  if (provider) {
    return {
      id: provider.id,
      api_key: provider.api_key,
      api_endpoint: provider.api_endpoint,
      selected_model: provider.selected_model,
      available_models: provider.available_models,
    };
  }
  // 兜底：旧 ai_configs 表
  const { data } = await supabase
    .from('ai_configs')
    .select('*')
    .limit(1)
    .maybeSingle();
  return data;
}

export async function testAiConnection(
  apiKey: string,
  apiEndpoint: string,
): Promise<{ success: boolean; models?: { id: string; name: string }[]; error?: string }> {
  const res = await supabase.functions.invoke('ai-service', {
    body: { action: 'test_connection', api_key: apiKey, api_endpoint: apiEndpoint },
  });
  if (res.error) return { success: false, error: res.error.message };
  return res.data;
}

export async function saveAiConfig(
  config: Omit<AiConfig, 'id'>,
): Promise<AiConfig> {
  const { data: existing } = await supabase
    .from('ai_configs')
    .select('id')
    .limit(1)
    .maybeSingle();

  if (existing) {
    const { data, error } = await supabase
      .from('ai_configs')
      .update({ ...config, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  const { data, error } = await supabase
    .from('ai_configs')
    .insert(config)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// ─── 数据变化监控 ───────────────────────────────────────────

// 作品指标变化（与上一次快照对比）
export interface WorkMetricsDelta {
  like_delta: number;
  comment_delta: number;
  share_delta: number;
  collect_delta: number;
  prev_snapshot_at: string | null;
}

export async function getWorkMetricsDelta(workId: string): Promise<WorkMetricsDelta | null> {
  const { data, error } = await supabase
    .from('work_snapshots')
    .select('like_count, comment_count, share_count, collect_count, snapshot_at')
    .eq('work_id', workId)
    .order('snapshot_at', { ascending: false })
    .limit(2);
  if (error || !data || data.length === 0) return null;

  const latest = data[0];
  // 只有一条快照时（首次记录），无法计算变化
  if (data.length < 2) {
    return { like_delta: 0, comment_delta: 0, share_delta: 0, collect_delta: 0, prev_snapshot_at: null };
  }
  const prev = data[1];
  return {
    like_delta: (latest.like_count || 0) - (prev.like_count || 0),
    comment_delta: (latest.comment_count || 0) - (prev.comment_count || 0),
    share_delta: (latest.share_count || 0) - (prev.share_count || 0),
    collect_delta: (latest.collect_count || 0) - (prev.collect_count || 0),
    prev_snapshot_at: prev.snapshot_at,
  };
}

// 批量获取多个作品的变化（用于列表页优化查询）
export async function getWorksMetricsDelta(workIds: string[]): Promise<Record<string, WorkMetricsDelta>> {
  if (workIds.length === 0) return {};
  const result: Record<string, WorkMetricsDelta> = {};

  // 查询每个作品最新的两条快照
  const { data, error } = await supabase
    .from('work_snapshots')
    .select('work_id, like_count, comment_count, share_count, collect_count, snapshot_at')
    .in('work_id', workIds)
    .order('snapshot_at', { ascending: false });

  if (error || !data) return {};

  // 按 work_id 分组
  const grouped: Record<string, typeof data> = {};
  for (const row of data) {
    if (!grouped[row.work_id]) grouped[row.work_id] = [];
    grouped[row.work_id].push(row);
  }

  for (const [wid, snapshots] of Object.entries(grouped)) {
    if (snapshots.length < 2) {
      result[wid] = { like_delta: 0, comment_delta: 0, share_delta: 0, collect_delta: 0, prev_snapshot_at: null };
    } else {
      const latest = snapshots[0];
      const prev = snapshots[1];
      result[wid] = {
        like_delta: (latest.like_count || 0) - (prev.like_count || 0),
        comment_delta: (latest.comment_count || 0) - (prev.comment_count || 0),
        share_delta: (latest.share_count || 0) - (prev.share_count || 0),
        collect_delta: (latest.collect_count || 0) - (prev.collect_count || 0),
        prev_snapshot_at: prev.snapshot_at,
      };
    }
  }
  return result;
}

// 博主粉丝量变化
export interface BloggerMetricsDelta {
  follower_delta: number;
  total_works_delta: number;
  prev_snapshot_at: string | null;
}

export async function getBloggerMetricsDelta(bloggerId: string): Promise<BloggerMetricsDelta | null> {
  const { data, error } = await supabase
    .from('blogger_snapshots')
    .select('follower_count, total_works, snapshot_at')
    .eq('blogger_id', bloggerId)
    .order('snapshot_at', { ascending: false })
    .limit(2);
  if (error || !data || data.length === 0) return null;
  if (data.length < 2) {
    return { follower_delta: 0, total_works_delta: 0, prev_snapshot_at: null };
  }
  const latest = data[0];
  const prev = data[1];
  return {
    follower_delta: (latest.follower_count || 0) - (prev.follower_count || 0),
    total_works_delta: (latest.total_works || 0) - (prev.total_works || 0),
    prev_snapshot_at: prev.snapshot_at,
  };
}

// 批量获取博主粉丝变化（用于列表页）
export async function getBloggersMetricsDelta(bloggerIds: string[]): Promise<Record<string, BloggerMetricsDelta>> {
  if (bloggerIds.length === 0) return {};
  const result: Record<string, BloggerMetricsDelta> = {};

  const { data, error } = await supabase
    .from('blogger_snapshots')
    .select('blogger_id, follower_count, total_works, snapshot_at')
    .in('blogger_id', bloggerIds)
    .order('snapshot_at', { ascending: false });

  if (error || !data) return {};

  const grouped: Record<string, typeof data> = {};
  for (const row of data) {
    if (!grouped[row.blogger_id]) grouped[row.blogger_id] = [];
    grouped[row.blogger_id].push(row);
  }

  for (const [bid, snapshots] of Object.entries(grouped)) {
    if (snapshots.length < 2) {
      result[bid] = { follower_delta: 0, total_works_delta: 0, prev_snapshot_at: null };
    } else {
      const latest = snapshots[0];
      const prev = snapshots[1];
      result[bid] = {
        follower_delta: (latest.follower_count || 0) - (prev.follower_count || 0),
        total_works_delta: (latest.total_works || 0) - (prev.total_works || 0),
        prev_snapshot_at: prev.snapshot_at,
      };
    }
  }
  return result;
}

// 获取作品的历史快照趋势（用于详情页图表）
export interface WorkSnapshot {
  snapshot_at: string;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
}

export async function getWorkSnapshots(workId: string, limit = 30): Promise<WorkSnapshot[]> {
  const { data, error } = await supabase
    .from('work_snapshots')
    .select('snapshot_at, like_count, comment_count, share_count, collect_count')
    .eq('work_id', workId)
    .order('snapshot_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.reverse(); // 按时间正序返回（旧→新）
}

// 获取博主粉丝量历史趋势
export interface BloggerSnapshot {
  snapshot_at: string;
  follower_count: number;
  total_works: number;
}

export async function getBloggerSnapshots(bloggerId: string, limit = 30): Promise<BloggerSnapshot[]> {
  const { data, error } = await supabase
    .from('blogger_snapshots')
    .select('snapshot_at, follower_count, total_works')
    .eq('blogger_id', bloggerId)
    .order('snapshot_at', { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.reverse();
}

// ─── 工具函数 ────────────────────────────────────────────────
export function formatCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}w`;
  return n.toString();
}

export function isToday(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return '';
  // 抖音 API 返回的 duration 是毫秒，如果值 > 100000 则视为毫秒
  let s = seconds;
  if (s > 100000) {
    s = Math.round(s / 1000);
  }
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const hm = m % 60;
    return `${h}小时${String(hm).padStart(2, '0')}分${String(rem).padStart(2, '0')}秒`;
  }
  if (m === 0) return `${rem}秒`;
  return `${m}分${String(rem).padStart(2, '0')}秒`;
}

export function formatDate(dateStr: string | null): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) {
    const hours = Math.floor(diff / (1000 * 60 * 60));
    if (hours === 0) return '刚刚';
    return `${hours}小时前`;
  }
  if (days === 1) return '昨天';
  if (days < 7) return `${days}天前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
