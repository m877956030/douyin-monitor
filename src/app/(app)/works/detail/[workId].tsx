// 作品详情页 — 文案 + AI对话
import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Modal,
  TextInput,
  FlatList,
  KeyboardAvoidingView,
  Dimensions,
  Platform,
} from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as WebBrowser from 'expo-web-browser';
import {
  ArrowLeft, Copy, ExternalLink, FileText,
  Sparkles, Send, AtSign, X,
  ChevronDown, Pen, Check, GitBranch,
  ArrowUp, ArrowDown, ChevronRight, Paperclip, Image as ImageIcon, Globe,
} from 'lucide-react-native';
import type { RelativePathString } from 'expo-router';

import {
  getWork, getTranscript, fetchTranscript,
  fetchTranscriptLocal, getLocalServerConfig, getDouyinCookie,
  getSiliconFlowKey, pingLocalServer,
  getAiConfig, getBloggers, getWorks, aiChat, uploadFile, formatCount, formatDate,
  getWritingTemplates, getAiProviders, setActiveAiProvider,
  getWorkMetricsDelta,
  getWebSearchKey,
} from '@/lib/api';
import { supabase } from '@/client/supabase';
import type { Work, Transcript, AiConfig, Blogger, WritingTemplate, AiProvider, WorkMetricsDelta } from '@/lib/types';
import AiAnalysisView from '@/components/AiAnalysisView';

// 浅色AI面板配色
const CS = {
  bg: '#F5F7FA',
  card: '#FFFFFF',
  border: '#E4E8EF',
  text: '#1A1D23',
  sub: '#6B7280',
  primary: '#2563EB',
  primaryBg: '#EFF6FF',
  userBubble: '#2563EB',
  aiBubble: '#FFFFFF',
  tplBg: '#F0F9FF',
  tplBorder: '#BAE6FD',
  tplText: '#0369A1',
};

// @选择器步骤：先选博主，再选作品
type AtPickStep = 'blogger' | 'work';

// @选择器搜索状态
interface AtSearchState {
  bloggerQuery: string;
  workQuery: string;
}

export default function WorkDetailScreen() {
  const { workId } = useLocalSearchParams<{ workId: string }>();
  const [work, setWork] = useState<Work | null>(null);
  const [loading, setLoading] = useState(true);
  const [metricsDelta, setMetricsDelta] = useState<WorkMetricsDelta | null>(null);

  // 文案
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [fetchingTranscript, setFetchingTranscript] = useState(false);
  const [transcriptError, setTranscriptError] = useState('');
  const [copied, setCopied] = useState(false);
  const [fetchStatus, setFetchStatus] = useState('');

  // AI分析
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [allProviders, setAllProviders] = useState<AiProvider[]>([]);
  const [showProviderPicker, setShowProviderPicker] = useState(false);

  // 手动输入文案
  const [manualInputVisible, setManualInputVisible] = useState(false);
  const [manualText, setManualText] = useState('');

  // 转录模式：auto（自动检测）| online（在线）| local（本地）
  type TranscriptMode = 'auto' | 'online' | 'local';
  const [transcriptMode, setTranscriptMode] = useState<TranscriptMode>('auto');
  const [localEngine, setLocalEngine] = useState('siliconflow');
  const [localServerOnline, setLocalServerOnline] = useState<boolean | null>(null);
  const [checkingServer, setCheckingServer] = useState(false);

  // 检测本地服务器状态
  const checkLocalServer = useCallback(async () => {
    try {
      const cfg = await getLocalServerConfig();
      if (!cfg.host) { setLocalServerOnline(false); return; }
      setCheckingServer(true);
      // 同时加载保存的引擎配置
      if (cfg.engine) setLocalEngine(cfg.engine);
      const online = await pingLocalServer(cfg.host, cfg.port);
      setLocalServerOnline(online);
    } catch {
      setLocalServerOnline(false);
    } finally {
      setCheckingServer(false);
    }
  }, []);

  // 故事线拆解
  const [showStoryModal, setShowStoryModal] = useState(false);
  const [storyLoading, setStoryLoading] = useState(false);
  const [storyResult, setStoryResult] = useState('');

  // 悬浮AI对话
  const [showAiChat, setShowAiChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatListRef = useRef<FlatList>(null);

  // @选择器
  const [showAtPicker, setShowAtPicker] = useState(false);
  const [atStep, setAtStep] = useState<AtPickStep>('blogger');
  const [atBloggers, setAtBloggers] = useState<Blogger[]>([]);
  const [atWorks, setAtWorks] = useState<Work[]>([]);
  const [atSelectedBlogger, setAtSelectedBlogger] = useState<Blogger | null>(null);
  const [atSearch, setAtSearch] = useState<AtSearchState>({ bloggerQuery: '', workQuery: '' });

  // @引用的上下文（不显示在输入框，而是在系统消息中传给AI）
  const [atContexts, setAtContexts] = useState<{ blogger: string; work: string; content: string }[]>([]);

  // 联网搜索
  const [webSearch, setWebSearch] = useState(false);
  const [webSearchKey, setWebSearchKey] = useState('');

  // 附件
  const [attachments, setAttachments] = useState<{
    id: string; name: string; mimeType: string; uri: string; publicUrl: string; isImage: boolean; textContent?: string;
  }[]>([]);

  // 复制
  const [copiedMsgIndex, setCopiedMsgIndex] = useState<number | null>(null);

  // 写作模板
  const [templates, setTemplates] = useState<WritingTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  const loadData = useCallback(async (id: string) => {
    try {
      const [w, t, cfg, tpls, provs, delta, wsKey] = await Promise.all([
        getWork(id),
        getTranscript(id),
        getAiConfig(),
        getWritingTemplates(),
        getAiProviders(),
        getWorkMetricsDelta(id),
        getWebSearchKey(),
      ]);
      setWork(w);
      setTranscript(t);
      setAiConfig(cfg);
      setTemplates(tpls);
      setAllProviders(provs);
      setMetricsDelta(delta);
      setWebSearchKey(wsKey || '');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (workId) { setLoading(true); loadData(workId); }
    }, [workId, loadData]),
  );

  // 获取文案（自动/在线/本地 三种模式）
  const doFetchTranscript = async () => {
    if (!work?.douyin_aweme_id && !work?.video_url) { setTranscriptError('无法获取视频地址'); return; }

    // 判断实际使用哪种方式
    let useLocal = false;
    if (transcriptMode === 'local') {
      useLocal = true;
    } else if (transcriptMode === 'auto') {
      // 自动模式：先检测本地服务器是否在线
      try {
        const cfg = await getLocalServerConfig();
        if (cfg.host) {
          const online = await pingLocalServer(cfg.host, cfg.port);
          if (online) useLocal = true;
        }
      } catch {}
    }
    // else 'online' → useLocal = false

    if (useLocal) {
      // ── 本地模式 ──
      setFetchingTranscript(true);
      setTranscriptError('');
      setFetchStatus('正在连接本地服务器...');
      try {
        const [localCfg, sfKey, douyinCookie] = await Promise.all([getLocalServerConfig(), getSiliconFlowKey(), getDouyinCookie()]);
        if (!localCfg.host) throw new Error('未配置本地服务器地址，请在设置中填写');
        // 根据选中的引擎检查是否需要 API Key
        const activeEngine = localEngine || localCfg.engine || 'siliconflow';
        if (activeEngine !== 'local_whisper' && !sfKey) {
          throw new Error('未配置硅基流动 API Key，请先在设置中填写');
        }
        if (!work?.video_url && !work?.play_url) throw new Error('没有视频链接');
        const videoUrl = work.play_url || work.video_url!;
        const content = await fetchTranscriptLocal(videoUrl, sfKey, localCfg.host, localCfg.port, douyinCookie || undefined, activeEngine);
        const tData: Transcript = { id: '', work_id: work.id, content, word_count: content.replace(/\s/g, '').length, created_at: new Date().toISOString() };
        setTranscript(tData);
        supabase.from('transcripts').upsert(
          { work_id: work.id, content, word_count: content.replace(/\s/g, '').length, updated_at: new Date().toISOString() },
          { onConflict: 'work_id' }
        ).then().catch(() => {});
        setFetchStatus('');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '本地转录失败';
        setTranscriptError(msg);
      } finally {
        setFetchingTranscript(false);
      }
    } else {
      // ── 在线模式（Edge Function） ──
      if (!work?.douyin_aweme_id) { setTranscriptError('无法获取视频地址'); return; }
      setFetchingTranscript(true);
      setTranscriptError('');
      setFetchStatus(transcriptMode === 'auto' ? '本地不在线，自动切换在线转录...' : '正在下载视频音频...');
      const statusTimer = setTimeout(() => setFetchStatus('正在提交语音识别引擎处理...'), 5000);
      const statusTimer2 = setTimeout(() => setFetchStatus('AI 识别中，请耐心等待（通常需要 10-30 秒）'), 15000);
      try {
        const sfKey = await getSiliconFlowKey();
        if (!sfKey) throw new Error('未配置硅基流动 API Key，请在设置中填写');
        const t = await fetchTranscript(work.id, work.video_url || '', work.douyin_aweme_id, sfKey);
        setTranscript(t);
        setFetchStatus('');
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : '文案获取失败，请重试';
        setTranscriptError(msg + '，可尝试「手动输入」');
      } finally {
        clearTimeout(statusTimer);
        clearTimeout(statusTimer2);
        setFetchStatus('');
        setFetchingTranscript(false);
      }
    }
  };

  const handleCopy = async () => {
    if (!transcript?.content) return;
    await Clipboard.setStringAsync(transcript.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleManualSave = async () => {
    const text = manualText.trim();
    if (!text) return;
    const tData: Transcript = {
      id: '',
      work_id: work?.id || '',
      content: text,
      word_count: text.replace(/\s/g, '').length,
      created_at: new Date().toISOString(),
    };
    setTranscript(tData);
    // 保存到 DB
    supabase.from('transcripts').upsert(
      { work_id: work?.id, content: text, word_count: text.replace(/\s/g, '').length, updated_at: new Date().toISOString() },
      { onConflict: 'work_id' }
    ).then().catch(() => {});
    setManualInputVisible(false);
    setManualText('');
  };

  const handleOpenLink = async () => {
    if (!work?.video_url) return;
    await WebBrowser.openBrowserAsync(work.video_url);
  };

  // 故事线拆解
  const handleStoryBreakdown = async () => {
    if (!transcript?.content || !aiConfig) return;
    setStoryLoading(true);
    setStoryResult('');
    setShowStoryModal(true);
    try {
      const systemMsg = {
        role: 'system',
        content: '你是一名纪录片编导。请把下面文案拆解成纪录片故事线。要求：- 去掉所有形容词、情绪词、修辞。- 去掉所有作者观点。- 保留人物经历、事件、时间节点、人物关系、重大决定、结果。- 相同内容合并。- 每个事件控制在20~40字。- 每句话只保留一个核心信息。-如果其中一项没有可以忽略不写。\n\n格式：\n## 人物背景\n• ...\n\n## 成长经历\n• ...\n\n## 事业发展\n• ...\n\n## 冲突与困境\n• ...\n\n## 转折事件\n• ...\n\n## 社会贡献\n• ...\n\n## 历史影响\n• ...'
      };
      const userMsg = { role: 'user', content: transcript.content };
      const reply = await aiChat([systemMsg, userMsg], aiConfig);
      setStoryResult(reply);
    } catch (e: unknown) {
      setStoryResult('拆解失败：' + (e instanceof Error ? e.message : '请重试'));
    } finally {
      setStoryLoading(false);
    }
  };

  // @选择器 — Step1: 选博主（支持搜索）
  const openAtPicker = async () => {
    const bls = await getBloggers();
    setAtBloggers(bls);
    setAtStep('blogger');
    setAtSelectedBlogger(null);
    setAtSearch({ bloggerQuery: '', workQuery: '' });
    setShowAtPicker(true);
  };

  // 过滤博主列表
  const filteredBloggers = atSearch.bloggerQuery
    ? atBloggers.filter((b) => b.nickname.toLowerCase().includes(atSearch.bloggerQuery.toLowerCase()))
    : atBloggers;

  const handleSelectBlogger = async (blogger: Blogger) => {
    setAtSelectedBlogger(blogger);
    const ws = await getWorks(blogger.id);
    setAtWorks(ws);
    setAtSearch((prev) => ({ ...prev, workQuery: '' }));
    setAtStep('work');
  };

  // 过滤作品列表
  const filteredWorks = atSearch.workQuery
    ? atWorks.filter((w) => (w.title || '').toLowerCase().includes(atSearch.workQuery.toLowerCase()))
    : atWorks;

  const handleSelectWork = async (selectedWork: Work) => {
    setShowAtPicker(false);
    // 获取选中作品的文案，存入 atContexts（不显示在输入框）
    let transcriptContent = '';
    try {
      const t = await getTranscript(selectedWork.id);
      if (t?.content) {
        transcriptContent = t.content;
      }
    } catch {}
    const bloggerName = atSelectedBlogger?.nickname || '';
    const workTitle = selectedWork.title.slice(0, 30);
    setAtContexts((prev) => [...prev, { blogger: bloggerName, work: workTitle, content: transcriptContent }]);
    // 输入框只显示标签形式的引用，而非全文
    const tag = `@[${bloggerName}《${workTitle}》] `;
    setChatInput((prev) => prev.replace(/@$/, '') + tag);
  };

  // ─── 文件选择（立即显示预览，内容在发送时读取） ─────────
  const handlePickFile = async () => {
    try {
      const pickResult = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf', 'text/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (pickResult.canceled || !pickResult.assets?.length) return;

      const uploaded: typeof attachments = [];

      for (const asset of pickResult.assets) {
        const isImg = asset.mimeType?.startsWith('image/') ?? false;
        uploaded.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: asset.name,
          mimeType: asset.mimeType || 'application/octet-stream',
          uri: asset.uri,
          publicUrl: '',
          isImage: isImg,
          textContent: undefined,
        });
      }

      if (uploaded.length > 0) {
        setAttachments((prev) => [...prev, ...uploaded]);

        // 后台异步加载内容
        for (const att of uploaded) {
          const asset = pickResult.assets.find((a: { uri: string }) => a.uri === att.uri);
          if (!asset) continue;
          const isImg = asset.mimeType?.startsWith('image/') ?? false;
          if (isImg) {
            readFileAsBase64(asset.uri).then((raw) => compressRawImage(raw, asset.mimeType || 'image/jpeg')).then((url) => {
              setAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, publicUrl: url } : a));
            }).catch(() => {});
          } else {
            readFileAsText(asset.uri).then((t) => {
              setAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, textContent: t.length > 5000 ? t.slice(0, 5000) + '\n\n...（过长截断）' : t } : a));
            }).catch(() => {});
          }
        }
      }
    } catch (e) {
      console.warn('文件选择失败:', e);
    }
  };

  // ─── 文件读取工具函数 ────────────────────────────────
  async function readFileAsBase64(uri: string): Promise<string> {
    try {
      const resp = await fetch(uri);
      const buf = await resp.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let bin = '';
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return btoa(bin);
    } catch {
      const { FileSystem, EncodingType } = await import('expo-file-system');
      return await FileSystem.readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    }
  }

  async function readFileAsText(uri: string): Promise<string> {
    try {
      const resp = await fetch(uri);
      return await resp.text();
    } catch {
      const { FileSystem, EncodingType } = await import('expo-file-system');
      return await FileSystem.readAsStringAsync(uri, { encoding: EncodingType.UTF8 });
    }
  }

  async function compressRawImage(base64: string, mimeType: string): Promise<string> {
    try {
      const src = `data:${mimeType || 'image/jpeg'};base64,${base64}`;
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = src;
      });
      let { width: w, height: h } = img;
      const M = 1280;
      if (w > M || h > M) { const r = Math.min(M / w, M / h); w = Math.round(w * r); h = Math.round(h * r); }
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      c.getContext('2d')!.drawImage(img, 0, 0, w, h);
      return c.toDataURL('image/jpeg', 0.7);
    } catch {
      return `data:${mimeType || 'image/jpeg'};base64,${base64}`;
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // ─── 工具函数：将 content（string 或 array）转为显示文本 ──
  const contentToDisplayString = (content: string | unknown[]): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      // 从 content parts 中提取文本部分
      const texts = content
        .filter((p): p is { type: string; text?: string } => typeof p === 'object' && p !== null)
        .map((p) => (p.type === 'text' ? p.text || '' : p.type === 'image_url' ? '[图片]' : `[${p.type || '文件'}]`))
        .filter(Boolean);
      return texts.join(' ') || '[附件消息]';
    }
    return String(content);
  };

  // 复制消息
  const handleCopyMessage = async (content: string, index: number) => {
    const str = contentToDisplayString(content);
    await Clipboard.setStringAsync(str);
    setCopiedMsgIndex(index);
    setTimeout(() => setCopiedMsgIndex(null), 2000);
  };

  // 插入写作模板
  const handleInsertTemplate = (tpl: WritingTemplate) => {
    setChatInput((prev) => (prev ? prev + '\n' : '') + tpl.content + ' ');
    setShowTemplates(false);
  };

  // 切换 AI 提供商
  const handleSwitchProvider = async (provider: AiProvider) => {
    await setActiveAiProvider(provider.id);
    setAiConfig({
      id: provider.id,
      api_key: provider.api_key,
      api_endpoint: provider.api_endpoint,
      selected_model: provider.selected_model,
      available_models: provider.available_models,
    });
    setAllProviders((prev) => prev.map((p) => ({ ...p, is_active: p.id === provider.id })));
    setShowProviderPicker(false);
  };

  const sendChat = async () => {
    const text = chatInput.trim();
    if ((!text && attachments.length === 0) || !aiConfig) return;

    // 构建系统消息：当前文案 + @引用的其他作品文案
    let contextContent = '';
    if (transcript?.content) {
      contextContent += `\n\n当前作品文案：\n${transcript.content}`;
    }
    if (atContexts.length > 0) {
      contextContent += '\n\n用户引用的其他作品：';
      for (const ctx of atContexts) {
        contextContent += `\n\n【${ctx.blogger}《${ctx.work}》文案】\n${ctx.content || '（无文案）'}`;
      }
    }
    const systemMsg = { role: 'system', content: `你是一位专业的短视频内容分析与写作助手，回答请简洁专业、分点清晰。${contextContent}` };

    // 构建用户消息（支持附件）
    let userContent: string | unknown[];
    if (attachments.length === 0) {
      userContent = text;
    } else {
      const parts: unknown[] = [];
      if (text) parts.push({ type: 'text', text });
      for (const att of attachments) {
        if (att.isImage) {
          if (!att.publicUrl) {
            parts.push({ type: 'text', text: `[附件图片：${att.name}（图片数据尚未加载完成，请等待图标出现后重试）]` });
            continue;
          }
          parts.push({ type: 'image_url', image_url: { url: att.publicUrl } });
        } else if (att.textContent) {
          parts.push({
            type: 'text',
            text: `[文件附件：${att.name}]\n${att.textContent}\n[附件结束]`,
          });
        } else if (att.publicUrl.startsWith('https://') || att.publicUrl.startsWith('http://')) {
          parts.push({
            type: 'text',
            text: `[文件附件：${att.name}]\n文件类型：${att.mimeType}\n已上传到：${att.publicUrl}\n请根据文件内容进行分析。`,
          });
        } else {
          parts.push({
            type: 'text',
            text: `[文件附件：${att.name}]\n文件类型：${att.mimeType}\n（二进制文件，无法读取文本内容）`,
          });
        }
      }
      userContent = parts;
    }

    const userMsg = { role: 'user', content: userContent };
    const newMessages = [...chatMessages, userMsg] as { role: string; content: string | unknown[] }[];
    setChatMessages(newMessages as { role: string; content: string }[]);
    setChatInput('');
    setAtContexts([]);
    setAttachments([]);
    setChatLoading(true);
    try {
      const reply = await aiChat(
        [systemMsg, ...newMessages],
        aiConfig,
        webSearch && webSearchKey ? { webSearch: true, webSearchKey } : undefined,
      );
      setChatMessages([...newMessages, { role: 'assistant', content: reply }] as { role: string; content: string }[]);
      setTimeout(() => chatListRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: unknown) {
      setChatMessages([...newMessages, {
        role: 'assistant',
        content: e instanceof Error ? `错误：${e.message}` : 'AI 响应失败，请重试',
      }] as { role: string; content: string }[]);
    } finally { setChatLoading(false); }
  };

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#F5F7FA' }}>
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!work) {
    return (
      <View className="flex-1 items-center justify-center gap-3" style={{ backgroundColor: '#F5F7FA' }}>
        <Text style={{ color: '#6B7280' }}>作品不存在</Text>
        <Pressable onPress={() => router.back()} className="active:opacity-60">
          <Text style={{ color: '#2563EB' }}>返回</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#F5F7FA' }}>
      {/* 头部 */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E4E8EF', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16 }}>
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="p-1 active:opacity-60">
            <ArrowLeft size={22} color="#1A1D23" />
          </Pressable>
          <Text className="flex-1 font-bold" style={{ color: '#1A1D23', fontSize: 16 }}>
            {work.title || '作品详情'}
          </Text>
        </View>
        <Pressable
          style={{ marginTop: 10, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F5F7FA', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}
          onPress={handleOpenLink}
        >
          <ExternalLink size={14} color="#2563EB" />
          <Text style={{ color: '#2563EB', fontSize: 12, flex: 1 }} numberOfLines={1}>
            {work.video_url || '暂无链接'}
          </Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 8, flexWrap: 'wrap' }}>
          {[
            { emoji: '❤️', value: formatCount(work.like_count), delta: metricsDelta?.like_delta },
            { emoji: '💬', value: formatCount(work.comment_count), delta: metricsDelta?.comment_delta },
            { emoji: '🔄', value: formatCount(work.share_count), delta: metricsDelta?.share_delta },
            { emoji: '⭐', value: formatCount(work.collect_count), delta: metricsDelta?.collect_delta },
          ].map((item) => {
            const hasDelta = item.delta !== undefined && item.delta !== 0;
            const deltaColor = !hasDelta ? '#9CA3AF' : (item.delta! > 0 ? '#EF4444' : '#22C55E');
            const DeltaIcon = !hasDelta ? null : (item.delta! > 0 ? ArrowUp : ArrowDown);
            return (
            <View key={item.emoji} className="flex-row gap-1 items-center">
              <Text style={{ fontSize: 12 }}>{item.emoji}</Text>
              <Text style={{ color: '#1A1D23', fontSize: 12, fontWeight: '600' }}>{item.value}</Text>
              {hasDelta && DeltaIcon && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0 }}>
                  <DeltaIcon size={10} color={deltaColor} />
                  <Text style={{ color: deltaColor, fontSize: 10, fontWeight: '700' }}>
                    {item.delta! > 0 ? '+' : ''}{formatCount(item.delta!)}
                  </Text>
                </View>
              )}
            </View>
            );
          })}
          <Text style={{ color: '#9CA3AF', fontSize: 12, marginLeft: 'auto' }}>{formatDate(work.publish_time)}</Text>
        </View>
        {metricsDelta?.prev_snapshot_at && (
          <Text style={{ color: '#9CA3AF', fontSize: 10, marginTop: 4 }}>
            数据变化对比上次刷新（{formatDate(metricsDelta.prev_snapshot_at)}）
          </Text>
        )}
      </View>

      {/* 文案内容区 */}
      <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingBottom: 80 }}>
        <View className="p-4 gap-3">
          {/* 模式切换指示器 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            <Pressable
              style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: transcriptMode === 'auto' ? '#2563EB' : '#F3F4F6' }}
              onPress={() => setTranscriptMode('auto')}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: transcriptMode === 'auto' ? '#FFFFFF' : '#6B7280' }}>智能</Text>
            </Pressable>
            <Pressable
              style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: transcriptMode === 'online' ? '#2563EB' : '#F3F4F6' }}
              onPress={() => setTranscriptMode('online')}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: transcriptMode === 'online' ? '#FFFFFF' : '#6B7280' }}>在线</Text>
            </Pressable>
            <Pressable
              style={{ paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12, backgroundColor: transcriptMode === 'local' ? '#2563EB' : '#F3F4F6' }}
              onPress={() => setTranscriptMode('local')}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: transcriptMode === 'local' ? '#FFFFFF' : '#6B7280' }}>本地</Text>
            </Pressable>
            {/* 本地服务器状态指示灯 */}
            {localServerOnline === true && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#16A34A' }} />
                <Text style={{ color: '#16A34A', fontSize: 10 }}>在线</Text>
              </View>
            )}
            {localServerOnline === false && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#9CA3AF' }} />
                <Text style={{ color: '#9CA3AF', fontSize: 10 }}>离线</Text>
              </View>
            )}
            {checkingServer && (
              <ActivityIndicator size="small" color="#9CA3AF" />
            )}
          </View>

          {/* 本地转录引擎选择（仅在本地模式显示） */}
          {transcriptMode === 'local' && (
            <View style={{ flexDirection: 'row', gap: 4, marginBottom: 4 }}>
              {[
                { key: 'siliconflow', label: '硅基流动' },
                { key: 'local_whisper', label: '本地Whisper' },
              ].map(opt => (
                <Pressable
                  key={opt.key}
                  style={{
                    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
                    backgroundColor: localEngine === opt.key ? '#10B981' : '#F3F4F6',
                  }}
                  onPress={() => setLocalEngine(opt.key)}
                >
                  <Text style={{ fontSize: 10, fontWeight: '600', color: localEngine === opt.key ? '#FFFFFF' : '#6B7280' }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {/* 在线转录引擎（仅硅基流动） */}

          <View className="flex-row gap-2">
            <Pressable
              style={{ flex: 1, borderWidth: 1, borderColor: '#2563EB', borderRadius: 10, paddingVertical: 10, alignItems: 'center' }}
              onPress={doFetchTranscript}
              disabled={fetchingTranscript}
            >
              {fetchingTranscript ? (
                <ActivityIndicator size="small" color="#2563EB" />
              ) : (
                <Text style={{ color: '#2563EB', fontSize: 13, fontWeight: '600' }}>
                  {transcript ? '重新获取' : '获取文案'}
                </Text>
              )}
            </Pressable>
            <Pressable
              style={{ borderWidth: 1, borderColor: '#E4E8EF', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' }}
              onPress={() => { setManualText(transcript?.content || ''); setManualInputVisible(true); }}
            >
              <Text style={{ color: '#6B7280', fontSize: 13, fontWeight: '500' }}>
                手动
              </Text>
            </Pressable>
            <Pressable
              style={{ borderWidth: 1, borderColor: '#10B981', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, alignItems: 'center' }}
              onPress={checkLocalServer}
            >
              <Text style={{ color: '#059669', fontSize: 12, fontWeight: '500' }}>
                检测
              </Text>
            </Pressable>
            {transcript && (
              <Pressable
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: '#E4E8EF', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 }}
                onPress={handleCopy}
              >
                {copied ? <Check size={16} color="#2563EB" /> : <Copy size={16} color="#9CA3AF" />}
                <Text style={{ color: copied ? '#2563EB' : '#6B7280', fontSize: 13 }}>
                  {copied ? '已复制' : '复制'}
                </Text>
              </Pressable>
            )}
          </View>

          {transcriptError ? (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 8, padding: 12 }}>
              <Text style={{ color: '#DC2626', fontSize: 13 }}>{transcriptError}</Text>
            </View>
          ) : null}

          {fetchStatus ? (
            <View style={{ backgroundColor: '#FFFBEB', borderRadius: 8, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size="small" color="#D97706" />
              <Text style={{ color: '#92400E', fontSize: 12, flex: 1 }}>{fetchStatus}</Text>
            </View>
          ) : null}

          {transcript ? (
            <>
              <View className="flex-row items-center justify-between">
                <Text style={{ color: '#9CA3AF', fontSize: 12 }}>共 {transcript.word_count} 字</Text>
              </View>
              <Text style={{ color: '#1A1D23', fontSize: 13, lineHeight: 24 }}>
                {transcript.content}
              </Text>
              {aiConfig && (
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, paddingVertical: 12, marginTop: 8 }}
                  onPress={() => setShowAnalysis(true)}
                >
                  <Sparkles size={16} color="#2563EB" />
                  <Text style={{ color: '#2563EB', fontWeight: '600', fontSize: 14 }}>生成AI详细分析</Text>
                </Pressable>
              )}
              {aiConfig && transcript?.content && transcript.content.trim().length > 10 && (
                <Pressable
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE', borderRadius: 10, paddingVertical: 12, marginTop: 6 }}
                  onPress={handleStoryBreakdown}
                >
                  <GitBranch size={16} color="#7C3AED" />
                  <Text style={{ color: '#7C3AED', fontWeight: '600', fontSize: 14 }}>故事线拆解 + 思维导图</Text>
                </Pressable>
              )}
              {!aiConfig && (
                <View style={{ backgroundColor: '#F5F7FA', borderRadius: 8, padding: 12 }}>
                  <Text style={{ color: '#6B7280', fontSize: 12, textAlign: 'center' }}>
                    请先在"设置"中配置 AI 助手，即可使用 AI 分析功能
                  </Text>
                </View>
              )}
            </>
          ) : (
            !fetchingTranscript && (
              <View style={{ alignItems: 'center', marginTop: 40, gap: 10 }}>
                <FileText size={36} color="#CBD5E1" />
                <Text style={{ color: '#6B7280', fontSize: 14 }}>点击按钮提取视频文案</Text>
                <Text style={{ color: '#9CA3AF', fontSize: 12, textAlign: 'center', paddingHorizontal: 16 }}>
                  接口一 SenseVoiceSmall / 接口二 TeleSpeechASR / 接口三 本地FFmpeg转录。当一个接口失败时可尝试另一个。接口三需先在设置中配置本地服务器
                </Text>
              </View>
            )
          )}
        </View>
      </ScrollView>

      {/* 悬浮AI按钮 */}
      {aiConfig && (
        <Pressable
          style={{ position: 'absolute', bottom: 24, right: 16, width: 52, height: 52, borderRadius: 26, backgroundColor: '#2563EB', alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.25, shadowRadius: 6 }}
          onPress={() => setShowAiChat(true)}
        >
          <Sparkles size={24} color="#FFFFFF" />
        </Pressable>
      )}

      {/* AI分析弹窗 */}
      <Modal visible={showAnalysis} animationType="slide">
        <AiAnalysisView
          workId={work.id}
          transcript={transcript?.content || ''}
          config={aiConfig}
          onClose={() => setShowAnalysis(false)}
        />
      </Modal>

      {/* ── 浅色AI对话弹窗 ──────────────────────────────── */}
      <Modal visible={showAiChat} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior="padding"
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 24}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: CS.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '78%' }}>
              {/* 顶部栏 */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: CS.border, backgroundColor: CS.card, borderTopLeftRadius: 20, borderTopRightRadius: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: CS.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
                    <Sparkles size={16} color={CS.primary} />
                  </View>
                  <Text style={{ color: CS.text, fontWeight: '700', fontSize: 16 }}>AI 对话</Text>
                  {/* 模型切换按钮 */}
                  <Pressable
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CS.tplBg, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: CS.tplBorder }}
                    onPress={() => allProviders.length > 0 && setShowProviderPicker(true)}
                  >
                    <Text style={{ color: CS.tplText, fontSize: 12, fontWeight: '600' }} numberOfLines={1}>
                      {aiConfig?.selected_model?.split('-').slice(0, 3).join('-') || '选择模型'}
                    </Text>
                    {allProviders.length > 1 && <ChevronDown size={12} color={CS.tplText} />}
                  </Pressable>
                </View>
                <Pressable onPress={() => setShowAiChat(false)} style={{ padding: 4 }}>
                  <X size={20} color={CS.sub} />
                </Pressable>
              </View>

              {/* 消息列表 */}
              <FlatList
                ref={chatListRef}
                data={chatMessages}
                keyExtractor={(_, i) => String(i)}
                contentContainerStyle={{ padding: 14, gap: 10 }}
                style={{ flex: 1, backgroundColor: CS.bg }}
                renderItem={({ item, index }) => (
                  <Pressable
                    onLongPress={() => handleCopyMessage(item.content, index)}
                    style={{
                      maxWidth: '85%',
                      alignSelf: item.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    {item.role !== 'user' && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4, marginLeft: 2 }}>
                        <Text style={{ color: CS.sub, fontSize: 11 }}>AI 助手</Text>
                        <Pressable onPress={() => handleCopyMessage(item.content, index)} style={{ padding: 2 }}>
                          {copiedMsgIndex === index ? (
                            <Check size={12} color={CS.primary} />
                          ) : (
                            <Copy size={12} color={CS.sub} />
                          )}</Pressable>
                      </View>
                    )}
                    <View style={{
                      backgroundColor: item.role === 'user' ? CS.userBubble : CS.aiBubble,
                      borderRadius: 14,
                      borderBottomRightRadius: item.role === 'user' ? 4 : 14,
                      borderBottomLeftRadius: item.role === 'user' ? 14 : 4,
                      paddingHorizontal: 14,
                      paddingVertical: 10,
                      borderWidth: item.role === 'user' ? 0 : 1,
                      borderColor: CS.border,
                    }}>
                      <Text style={{ color: item.role === 'user' ? '#fff' : CS.text, fontSize: 14, lineHeight: 22 }}>
                        {contentToDisplayString(item.content as string | unknown[])}
                      </Text>
                    </View>
                    {item.role === 'user' && (
                      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 2, marginRight: 2 }}>
                        <Pressable onPress={() => handleCopyMessage(item.content, index)} style={{ padding: 2 }}>
                          {copiedMsgIndex === index ? (
                            <Check size={12} color="#fff" />
                          ) : (
                            <Copy size={12} color="#94A3AF" />
                          )}
                        </Pressable>
                      </View>
                    )}
                  </Pressable>
                )}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', marginTop: 40, gap: 8 }}>
                    <Sparkles size={36} color="#CBD5E1" />
                    <Text style={{ color: CS.sub, fontSize: 14, textAlign: 'center' }}>
                      {transcript?.content ? '可以就当前文案向 AI 提问' : '请先获取文案后再提问'}
                    </Text>
                    <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center' }}>
                      点击 📎 上传图片/文档，点击 @ 引用博主作品
                    </Text>
                  </View>
                }
              />

              {/* 写作模板面板 */}
              {showTemplates && templates.length > 0 && (
                <View style={{ backgroundColor: CS.card, borderTopWidth: 1, borderTopColor: CS.border, paddingVertical: 10 }}>
                  <Text style={{ color: CS.sub, fontSize: 12, paddingHorizontal: 14, marginBottom: 6, fontWeight: '600' }}>写作风格模板</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}>
                    {templates.map((tpl) => (
                      <Pressable
                        key={tpl.id}
                        style={{backgroundColor: CS.tplBg,
                          borderWidth: 1,
                          borderColor: CS.tplBorder,
                          borderRadius: 10,
                          paddingHorizontal: 14,
                          paddingVertical: 8,
                          maxWidth: 180}}
                        onPress={() => handleInsertTemplate(tpl)}
                      >
                        <Text style={{ color: CS.tplText, fontSize: 13, fontWeight: '600' }}>{tpl.name}</Text>
                        <Text style={{ color: CS.sub, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{tpl.content}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {/* @引用标签列表（显示已引用的作品，可删除） */}
              {atContexts.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
                  {atContexts.map((ctx, i) => (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CS.tplBg, borderWidth: 1, borderColor: CS.tplBorder, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
                      <AtSign size={11} color={CS.tplText} />
                      <Text style={{ color: CS.tplText, fontSize: 11, fontWeight: '600' }} numberOfLines={1}>
                        {ctx.blogger}《{ctx.work}》
                      </Text>
                      <Pressable onPress={() => setAtContexts((prev) => prev.filter((_, idx) => idx !== i))} style={{ padding: 2 }}>
                        <X size={11} color={CS.tplText} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* 附件预览 */}
              {attachments.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12 }}>
                  {attachments.map((att) => (
                    <View key={att.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: CS.primaryBg, borderWidth: 1, borderColor: CS.border, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}>
                      {att.isImage ? (
                        <Image source={{ uri: att.publicUrl || att.uri }} style={{ width: 20, height: 20, borderRadius: 3 }} />
                      ) : (
                        <ImageIcon size={14} color={CS.primary} />
                      )}
                      <Text style={{ color: CS.text, fontSize: 11, fontWeight: '500', maxWidth: 100 }} numberOfLines={1}>{att.name}</Text>
                      <Pressable onPress={() => removeAttachment(att.id)} style={{ padding: 2 }}>
                        <X size={12} color={CS.sub} />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              {/* 输入区 */}
              <View style={{ backgroundColor: CS.card, borderTopWidth: 1, borderTopColor: CS.border, paddingHorizontal: 12, paddingVertical: 10, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
                  {/* 附件上传按钮 */}
                  <Pressable cssInterop={false}
                    style={{padding: 9, borderRadius: 10, backgroundColor: CS.primaryBg}}
                    onPress={handlePickFile}
                  >
                    <Paperclip size={18} color={CS.primary} />
                  </Pressable>
                  {/* @引用按钮 */}
                  <Pressable cssInterop={false}
                    style={{padding: 9, borderRadius: 10, backgroundColor: CS.primaryBg}}
                    onPress={openAtPicker}
                  >
                    <AtSign size={18} color={CS.primary} />
                  </Pressable>
                  {/* 联网搜索开关 */}
                  <Pressable
                    style={{ padding: 9, borderRadius: 10, backgroundColor: webSearch ? '#ECFDF5' : '#F9FAFB', borderWidth: 1, borderColor: webSearch ? '#A7F3D0' : CS.border }}
                    onPress={() => setWebSearch((v) => !v)}
                  >
                    <Globe size={18} color={webSearch ? '#059669' : CS.sub} />
                  </Pressable>
                  {/* 模板按钮 */}
                  <Pressable cssInterop={false}
                    style={{padding: 9, borderRadius: 10, backgroundColor: showTemplates ? CS.tplBg : '#F9FAFB', borderWidth: 1, borderColor: showTemplates ? CS.tplBorder : CS.border}}
                    onPress={() => setShowTemplates((v) => !v)}
                  >
                    <Pen size={18} color={showTemplates ? CS.tplText : CS.sub} />
                  </Pressable>
                  {/* 输入框 */}
                  <TextInput
                    value={chatInput}
                    onChangeText={setChatInput}
                    placeholder="输入问题或指令..."
                    placeholderTextColor="#9CA3AF"
                    style={{ flex: 1, backgroundColor: CS.bg, borderWidth: 1, borderColor: CS.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: CS.text, fontSize: 14, maxHeight: 100 }}
                    multiline
                  />
                  {/* 发送按钮 */}
                  <Pressable cssInterop={false}
                    style={{padding: 9, borderRadius: 10, backgroundColor: (chatInput.trim() || attachments.length > 0) ? CS.primary : '#F3F4F6'}}
                    onPress={sendChat}
                    disabled={chatLoading || (!chatInput.trim() && attachments.length === 0)}
                  >
                  >
                    {chatLoading
                      ? <ActivityIndicator size="small" color={CS.primary} />
                      : <Send size={18} color={chatInput.trim() ? '#fff' : '#9CA3AF'} />}
                  </Pressable>
                </View>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 模型切换选择器 ────────────────────────────────── */}
      <Modal visible={showProviderPicker} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: CS.card, borderRadius: 16, width: '100%', overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CS.border }}>
              <Text style={{ color: CS.text, fontWeight: '700', fontSize: 16 }}>切换 AI 模型</Text>
              <Pressable onPress={() => setShowProviderPicker(false)} className="active:opacity-60">
                <X size={18} color={CS.sub} />
              </Pressable>
            </View>
            {allProviders.map((p, idx) => {
              const isActive = p.id === aiConfig?.id;
              return (
                <Pressable
                  key={p.id}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: idx < allProviders.length - 1 ? 1 : 0, borderBottomColor: CS.border, backgroundColor: isActive ? CS.primaryBg : CS.card }}
                  onPress={() => handleSwitchProvider(p)}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: CS.text, fontWeight: '600', fontSize: 14 }}>{p.name}</Text>
                    <Text style={{ color: CS.sub, fontSize: 12, marginTop: 2 }}>{p.selected_model}</Text>
                  </View>
                  {isActive && <Check size={18} color={CS.primary} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      </Modal>

      {/* ── @引用选择器（小窗口弹出）──────────────────── */}
      <Modal visible={showAtPicker} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: CS.card, borderRadius: 16, width: '85%', maxWidth: 340, maxHeight: 360, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 }}>
            {/* 头部 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CS.border }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                {atStep === 'work' && (
                  <Pressable onPress={() => setAtStep('blogger')} style={{ padding: 2 }}>
                    <ArrowLeft size={16} color={CS.sub} />
                  </Pressable>
                )}
                <Text style={{ color: CS.text, fontWeight: '700', fontSize: 14 }}>
                  {atStep === 'blogger' ? '选择博主' : '选择作品'}
                </Text>
              </View>
              <Pressable onPress={() => setShowAtPicker(false)} style={{ padding: 2 }}>
                <X size={16} color={CS.sub} />
              </Pressable>
            </View>

            {/* 博主列表（带搜索） */}
            {atStep === 'blogger' && (
              <View style={{ maxHeight: 300 }}>
                {/* 搜索框 */}
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: CS.border }}>
                  <TextInput
                    value={atSearch.bloggerQuery}
                    onChangeText={(t) => setAtSearch((prev) => ({ ...prev, bloggerQuery: t }))}
                    placeholder="搜索博主..."
                    placeholderTextColor="#9CA3AF"
                    style={{ backgroundColor: CS.bg, borderWidth: 1, borderColor: CS.border, borderRadius: 8, color: CS.text, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12 }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <FlatList
                  data={filteredBloggers}
                  keyExtractor={(b) => b.id}
                  style={{ maxHeight: 250 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable cssInterop={false}
                      style={{flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CS.border}}
                      onPress={() => handleSelectBlogger(item)}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: CS.text, fontWeight: '600', fontSize: 13 }}>{item.nickname}</Text>
                        <Text style={{ color: CS.sub, fontSize: 11, marginTop: 1 }}>共 {item.total_works} 个作品</Text>
                      </View>
                      <ChevronRight size={14} color={CS.sub} />
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View style={{ alignItems: 'center', padding: 20 }}>
                      <Text style={{ color: CS.sub, fontSize: 13 }}>{atSearch.bloggerQuery ? '未找到匹配博主' : '暂无博主数据'}</Text>
                    </View>
                  }
                />
              </View>
            )}

            {/* 作品列表（带搜索） */}
            {atStep === 'work' && (
              <View style={{ maxHeight: 300 }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: CS.border }}>
                  <TextInput
                    value={atSearch.workQuery}
                    onChangeText={(t) => setAtSearch((prev) => ({ ...prev, workQuery: t }))}
                    placeholder="搜索作品标题..."
                    placeholderTextColor="#9CA3AF"
                    style={{ backgroundColor: CS.bg, borderWidth: 1, borderColor: CS.border, borderRadius: 8, color: CS.text, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12 }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <FlatList
                  data={filteredWorks}
                  keyExtractor={(w) => w.id}
                  style={{ maxHeight: 250 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable cssInterop={false}
                      style={{paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CS.border}}
                      onPress={() => handleSelectWork(item)}
                    >
                      <Text style={{ color: CS.text, fontSize: 12, fontWeight: '500' }} numberOfLines={2}>{item.title}</Text>
                      <Text style={{ color: CS.sub, fontSize: 10, marginTop: 2 }}>
                        {formatCount(item.like_count)} 赞 · {formatDate(item.publish_time)}
                      </Text>
                    </Pressable>
                  )}
                  ListEmptyComponent={
                    <View style={{ alignItems: 'center', padding: 20 }}>
                      <Text style={{ color: CS.sub, fontSize: 13 }}>{atSearch.workQuery ? '未找到匹配作品' : '该博主暂无作品'}</Text>
                    </View>
                  }
                />
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* ── 手动输入文案弹窗 ──────────────────────────────── */}
      <Modal visible={manualInputVisible} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', paddingHorizontal: 20 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16, maxHeight: '80%' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <Text style={{ color: '#1A1D23', fontSize: 16, fontWeight: '700' }}>
                {transcript ? '编辑文案' : '手动输入文案'}
              </Text>
              <Pressable onPress={() => setManualInputVisible(false)} style={{ padding: 4 }}>
                <X size={20} color="#6B7280" />
              </Pressable>
            </View>
            <TextInput
              value={manualText}
              onChangeText={setManualText}
              placeholder="在此粘贴或输入文案内容..."
              placeholderTextColor="#9CA3AF"
              multiline
              textAlignVertical="top"
              style={{
                backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#E4E8EF', borderRadius: 10,
                color: '#1A1D23', fontSize: 14, lineHeight: 22,
                paddingHorizontal: 12, paddingVertical: 10,
                minHeight: 200, maxHeight: 400,
              }}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
              <Pressable
                style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E4E8EF' }}
                onPress={() => setManualInputVisible(false)}
              >
                <Text style={{ color: '#6B7280', fontWeight: '500', fontSize: 14 }}>取消</Text>
              </Pressable>
              <Pressable
                style={{ paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: manualText.trim() ? '#2563EB' : '#E5E7EB' }}
                onPress={handleManualSave}
                disabled={!manualText.trim()}
              >
                <Text style={{ color: manualText.trim() ? '#FFFFFF' : '#9CA3AF', fontWeight: '600', fontSize: 14 }}>保存</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 故事线拆解 + 思维导图弹窗 ───────────────────── */}
      <Modal visible={showStoryModal} animationType="slide" transparent={false}>
        <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
          {/* 头部 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E4E8EF' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Pressable onPress={() => setShowStoryModal(false)} style={{ padding: 4 }}>
                <X size={22} color="#1A1D23" />
              </Pressable>
              <Text style={{ color: '#1A1D23', fontSize: 17, fontWeight: '700' }}>纪录片故事线</Text>
            </View>
          </View>

          {storyLoading ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
              <ActivityIndicator size="large" color="#7C3AED" />
              <Text style={{ color: '#6B7280', fontSize: 14 }}>正在拆解故事线...</Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
              {/* 思维导图区域 */}
              {storyResult && !storyResult.startsWith('拆解失败') && (
                <View style={{ marginBottom: 20 }}>
                  <Text style={{ color: '#7C3AED', fontSize: 13, fontWeight: '700', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    思维导图
                  </Text>
                  <MindMapView content={storyResult} />
                </View>
              )}

              {/* 详细拆解内容 */}
              {storyResult ? (
                <StorySectionsView content={storyResult} />
              ) : null}
            </ScrollView>
          )}
        </View>
      </Modal>
    </View>
  );
}

// ── 解析文案并渲染为结构化分段视图 ─────────────────
function StorySectionsView({ content }: { content: string }) {
  // 按 ## 分割段落
  const sections: { title: string; items: string[] }[] = [];
  const lines = content.split('\n');
  let currentSection: { title: string; items: string[] } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      currentSection = { title: headerMatch[1].trim(), items: [] };
      sections.push(currentSection);
    } else if (currentSection && line.trim().startsWith('•')) {
      currentSection.items.push(line.trim().replace(/^•\s*/, ''));
    }
  }

  if (sections.length === 0) {
    // 如果没解析到格式，直接显示原始内容
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: '#1A1D23', fontSize: 14, lineHeight: 22 }}>{content}</Text>
      </View>
    );
  }

  const sectionColors: Record<string, string> = {
    '人物背景': '#2563EB',
    '成长经历': '#7C3AED',
    '事业发展': '#0891B2',
    '冲突与困境': '#DC2626',
    '转折事件': '#D97706',
    '社会贡献': '#16A34A',
    '历史影响': '#6B7280',
  };

  return (
    <View style={{ gap: 16 }}>
      {sections.map((sec, idx) => {
        const color = sectionColors[sec.title] || '#6B7280';
        return (
          <View key={idx} style={{ backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, borderLeftWidth: 4, borderLeftColor: color }}>
            <Text style={{ color, fontSize: 15, fontWeight: '700', marginBottom: 8 }}>{sec.title}</Text>
            {sec.items.length > 0 ? (
              <View style={{ gap: 6 }}>
                {sec.items.map((item, i) => (
                  <Text key={i} style={{ color: '#374151', fontSize: 13, lineHeight: 20, paddingLeft: 8 }}>
                    • {item}
                  </Text>
                ))}
              </View>
            ) : (
              <Text style={{ color: '#9CA3AF', fontSize: 12, fontStyle: 'italic' }}>（无相关内容）</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── 思维导图视图（树状结构）────────────────────
function MindMapView({ content }: { content: string }) {
  const sections: { title: string; items: string[] }[] = [];
  const lines = content.split('\n');
  let currentSection: { title: string; items: string[] } | null = null;

  for (const line of lines) {
    const headerMatch = line.match(/^##\s+(.+)/);
    if (headerMatch) {
      currentSection = { title: headerMatch[1].trim(), items: [] };
      sections.push(currentSection);
    } else if (currentSection && line.trim().startsWith('•')) {
      currentSection.items.push(line.trim().replace(/^•\s*/, ''));
    }
  }

  if (sections.length === 0) return null;

  const sectionColors: Record<string, string> = {
    '人物背景': '#2563EB',
    '成长经历': '#7C3AED',
    '事业发展': '#0891B2',
    '冲突与困境': '#DC2626',
    '转折事件': '#D97706',
    '社会贡献': '#16A34A',
    '历史影响': '#6B7280',
  };

  return (
    <View style={{ backgroundColor: '#F5F7FA', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#E4E8EF' }}>
      {/* 中心节点 */}
      <View style={{ alignItems: 'center', marginBottom: 14 }}>
        <View style={{ backgroundColor: '#7C3AED', borderRadius: 10, paddingHorizontal: 18, paddingVertical: 10 }}>
          <Text style={{ color: '#FFFFFF', fontWeight: '700', fontSize: 14 }}>故事线</Text>
        </View>
      </View>

      {/* 分支节点 */}
      <View style={{ gap: 8 }}>
        {sections.map((sec, idx) => {
          const color = sectionColors[sec.title] || '#6B7280';
          return (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
              {/* 连线 */}
              <View style={{ alignItems: 'center', width: 24, marginRight: 4 }}>
                <View style={{ width: 2, flex: 1, backgroundColor: color, minHeight: 20 }} />
              </View>
              {/* 分支内容 */}
              <View style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: '#E4E8EF', padding: 10, marginBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
                  <Text style={{ color, fontWeight: '700', fontSize: 13 }}>{sec.title}</Text>
                </View>
                {sec.items.length > 0 && (
                  <View style={{ gap: 2 }}>
                    {sec.items.slice(0, 3).map((item, i) => (
                      <Text key={i} style={{ color: '#6B7280', fontSize: 11, lineHeight: 16 }} numberOfLines={2}>
                        • {item.length > 25 ? item.slice(0, 25) + '...' : item}
                      </Text>
                    ))}
                    {sec.items.length > 3 && (
                      <Text style={{ color: '#9CA3AF', fontSize: 10 }}>+{sec.items.length - 3} 项</Text>
                    )}
                  </View>
                )}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}
