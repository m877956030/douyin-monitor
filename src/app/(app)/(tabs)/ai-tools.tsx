// AI 对话页 — 与接入的 AI 大模型自由对话（支持图片/文档上传 + 自由复制）
import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import {
  Sparkles, Send, AtSign, X, ChevronDown, Pen, Check, ArrowLeft, ChevronRight,
  Paperclip, Copy, Image as ImageIcon, Globe,
} from 'lucide-react-native';
import type { RelativePathString } from 'expo-router';

import {
  getAiConfig, getBloggers, getWorks, aiChat, uploadFile, formatCount, formatDate,
  getWritingTemplates, getAiProviders, setActiveAiProvider,
  getWebSearchKey,
} from '@/lib/api';
import type { AiConfig, Blogger, Work, WritingTemplate, AiProvider } from '@/lib/types';

// 配色
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

// @选择器步骤
type AtStep = 'blogger' | 'work';

interface AtSearchState {
  bloggerQuery: string;
  workQuery: string;
}

// 附件类型
interface Attachment {
  id: string;
  name: string;
  mimeType: string;
  uri: string;
  publicUrl: string;   // 上传到 Supabase Storage 后的公共 URL，或回退的 data URI
  isImage: boolean;     // 是否为图片
  textContent?: string; // 可读取的文本内容（文档类文件）
}

export default function AiChatScreen() {
  const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
  const [allProviders, setAllProviders] = useState<AiProvider[]>([]);
  const [showProviderPicker, setShowProviderPicker] = useState(false);
  const [loading, setLoading] = useState(true);

  // 对话
  const [chatMessages, setChatMessages] = useState<{ role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const chatListRef = useRef<FlatList>(null);

  // 附件
  const [attachments, setAttachments] = useState<Attachment[]>([]);

  // 复制
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  // 写作模板
  const [templates, setTemplates] = useState<WritingTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);

  // @选择器
  const [showAtPicker, setShowAtPicker] = useState(false);
  const [atStep, setAtStep] = useState<AtStep>('blogger');
  const [atBloggers, setAtBloggers] = useState<Blogger[]>([]);
  const [atWorks, setAtWorks] = useState<Work[]>([]);
  const [atSelectedBlogger, setAtSelectedBlogger] = useState<Blogger | null>(null);
  const [atSearch, setAtSearch] = useState<AtSearchState>({ bloggerQuery: '', workQuery: '' });

  // 联网搜索
  const [webSearch, setWebSearch] = useState(false);
  const [webSearchKey, setWebSearchKey] = useState('');

  const loadConfig = useCallback(async () => {
    try {
      const [cfg, tpls, provs, wsKey] = await Promise.all([
        getAiConfig(),
        getWritingTemplates(),
        getAiProviders(),
        getWebSearchKey(),
      ]);
      setAiConfig(cfg);
      setTemplates(tpls);
      setAllProviders(provs);
      setWebSearchKey(wsKey || '');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadConfig();
    }, [loadConfig]),
  );

  // ─── 文件选择（立即显示预览，内容在发送时读取） ─────────
  const handlePickFile = async () => {
    try {
      const pickResult = await DocumentPicker.getDocumentAsync({
        type: ['image/*', 'application/pdf', 'text/*'],
        copyToCacheDirectory: true,
        multiple: true,
      });
      if (pickResult.canceled || !pickResult.assets?.length) return;

      const uploaded: Attachment[] = [];

      for (const asset of pickResult.assets) {
        const isImg = asset.mimeType?.startsWith('image/') ?? false;

        // 立即加入预览（内容延迟加载）
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
          const asset = pickResult.assets.find((a) => a.uri === att.uri);
          if (!asset) continue;
          const isImg = asset.mimeType?.startsWith('image/') ?? false;
          if (isImg) compressImage(asset.uri, asset.mimeType || 'image/jpeg').then((url) => {
            setAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, publicUrl: url } : a));
          }).catch(() => {});
          else readFileAsText(asset.uri).then((t) => {
            setAttachments((prev) => prev.map((a) => a.id === att.id ? { ...a, textContent: t.length > 5000 ? t.slice(0, 5000) + '\n\n...（过长截断）' : t } : a));
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('文件选择失败:', e);
    }
  };

  // ─── 图片压缩 ──────────────────────────────────────────
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

  const compressImage = async (uri: string, mimeType: string): Promise<string> => {
    try {
      const raw = await readFileAsBase64(uri);
      const src = `data:${mimeType || 'image/jpeg'};base64,${raw}`;
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
      const raw = await readFileAsBase64(uri);
      return `data:${mimeType || 'image/jpeg'};base64,${raw}`;
    }
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  // ─── 发送消息 ──────────────────────────────────────────────
  const sendChat = async () => {
    const text = chatInput.trim();
    if ((!text && attachments.length === 0) || !aiConfig) return;

    // 构建消息内容
    let userContent: string | unknown[];
    if (attachments.length === 0) {
      // 纯文本
      userContent = text;
    } else {
      // 文本 + 附件
      const parts: unknown[] = [];
      if (text) parts.push({ type: 'text', text });

      for (const att of attachments) {
        if (att.isImage) {
          if (!att.publicUrl) {
            // 图片还在加载中，跳过（用户可稍后重试）
            parts.push({ type: 'text', text: `[附件图片：${att.name}（图片数据尚未加载完成，请等待图标出现后重试）]` });
            continue;
          }
          parts.push({
            type: 'image_url',
            image_url: { url: att.publicUrl },
          });
        } else if (att.textContent) {
          // 文档类文件：直接发送纯文本内容（最可靠）
          parts.push({
            type: 'text',
            text: `[文件附件：${att.name}]\n${att.textContent}\n[附件结束]`,
          });
        } else if (att.publicUrl.startsWith('https://') || att.publicUrl.startsWith('http://')) {
          // 已上传到 Storage，有公共 URL
          parts.push({
            type: 'text',
            text: `[文件附件：${att.name}]\n文件类型：${att.mimeType}\n已上传到：${att.publicUrl}\n请根据文件内容进行分析。`,
          });
        } else {
          // 回退到 data URI（二进制文件，仅提示）
          parts.push({
            type: 'text',
            text: `[文件附件：${att.name}]\n文件类型：${att.mimeType}\n（二进制文件，无法读取文本内容）`,
          });
        }
      }
      userContent = parts;
    }

    const systemMsg = { role: 'system' as const, content: '你是一位专业的短视频内容分析与写作助手，回答请简洁专业、分点清晰。' };
    const userMsg = { role: 'user' as const, content: userContent };
    const newMessages = [...chatMessages, userMsg] as { role: string; content: string | unknown[] }[];
    setChatMessages(newMessages as { role: string; content: string }[]);
    setChatInput('');
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

  // @选择器
  const openAtPicker = async () => {
    const bls = await getBloggers();
    setAtBloggers(bls);
    setAtStep('blogger');
    setAtSelectedBlogger(null);
    setAtSearch({ bloggerQuery: '', workQuery: '' });
    setShowAtPicker(true);
  };

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

  const filteredWorks = atSearch.workQuery
    ? atWorks.filter((w) => (w.title || '').toLowerCase().includes(atSearch.workQuery.toLowerCase()))
    : atWorks;

  const handleSelectWork = async (selectedWork: Work) => {
    setShowAtPicker(false);
    let transcriptContent = '';
    try {
      const { getTranscript } = await import('@/lib/api');
      const t = await getTranscript(selectedWork.id);
      if (t?.content) transcriptContent = t.content.slice(0, 2000);
    } catch {}
    const mention = transcriptContent
      ? `[引用 ${atSelectedBlogger?.nickname || ''} 的作品《${selectedWork.title.slice(0, 20)}》文案：\n${transcriptContent}\n]`
      : `[引用 ${atSelectedBlogger?.nickname || ''} 的作品《${selectedWork.title.slice(0, 20)}》]`;
    setChatInput((prev) => prev.replace(/@$/, '') + mention + ' ');
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

  // ─── 工具函数：将 content（string 或 array）转为显示文本 ──
  const contentToDisplayString = (content: string | unknown[]): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const texts = content
        .filter((p): p is { type: string; text?: string } => typeof p === 'object' && p !== null)
        .map((p) => (p.type === 'text' ? p.text || '' : p.type === 'image_url' ? '[图片]' : `[${p.type || '文件'}]`))
        .filter(Boolean);
      return texts.join(' ') || '[附件消息]';
    }
    return String(content);
  };

  // 复制消息内容
  const handleCopyMessage = async (content: string, index: number) => {
    const str = contentToDisplayString(content);
    await Clipboard.setStringAsync(str);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  // 清空对话
  const handleClearChat = () => {
    setChatMessages([]);
  };

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: CS.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={CS.primary} />
      </View>
    );
  }

  if (!aiConfig) {
    return (
      <View style={{ flex: 1, backgroundColor: CS.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 }}>
        <Sparkles size={48} color="#CBD5E1" />
        <Text style={{ color: CS.sub, fontSize: 15, textAlign: 'center' }}>
          尚未配置 AI 提供商
        </Text>
        <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
          请先到底部「设置」页添加 AI 提供商并配置模型
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={{ flex: 1, backgroundColor: CS.bg }}
    >
      {/* 顶部栏 */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 54, paddingBottom: 12,
        backgroundColor: CS.card, borderBottomWidth: 1, borderBottomColor: CS.border,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: CS.primaryBg, alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={16} color={CS.primary} />
          </View>
          <Text style={{ color: CS.text, fontWeight: '700', fontSize: 17 }}>AI 对话</Text>
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
        {chatMessages.length > 0 && (
          <Pressable onPress={handleClearChat} style={{ padding: 4 }}>
            <Text style={{ color: CS.sub, fontSize: 12 }}>清空</Text>
          </Pressable>
        )}
      </View>

      {/* 消息列表 */}
      <FlatList
        ref={chatListRef}
        data={chatMessages}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ padding: 14, gap: 10, paddingBottom: 20 }}
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
                  {copiedIndex === index ? (
                    <Check size={12} color={CS.primary} />
                  ) : (
                    <Copy size={12} color={CS.sub} />
                  )}
                </Pressable>
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
                  {copiedIndex === index ? (
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
          <View style={{ alignItems: 'center', marginTop: 60, gap: 10 }}>
            <Sparkles size={44} color="#CBD5E1" />
            <Text style={{ color: CS.sub, fontSize: 15, textAlign: 'center' }}>
              开始与 AI 对话
            </Text>
            <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center', paddingHorizontal: 20 }}>
              可以提问抖音内容分析、文案写作建议等{'\n'}点击 @ 引用博主作品，📎 上传图片/文档
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
                style={{ backgroundColor: CS.tplBg, borderWidth: 1, borderColor: CS.tplBorder, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, maxWidth: 180 }}
                onPress={() => handleInsertTemplate(tpl)}
              >
                <Text style={{ color: CS.tplText, fontSize: 13, fontWeight: '600' }}>{tpl.name}</Text>
                <Text style={{ color: CS.sub, fontSize: 11, marginTop: 2 }} numberOfLines={1}>{tpl.content}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 附件预览 */}
      {attachments.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: CS.card }}>
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
          <Pressable
            style={{ padding: 9, borderRadius: 10, backgroundColor: CS.primaryBg }}
            onPress={handlePickFile}
          >
            <Paperclip size={18} color={CS.primary} />
          </Pressable>
          {/* @引用按钮 */}
          <Pressable
            style={{ padding: 9, borderRadius: 10, backgroundColor: CS.primaryBg }}
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
          <Pressable
            style={{ padding: 9, borderRadius: 10, backgroundColor: showTemplates ? CS.tplBg : '#F9FAFB', borderWidth: 1, borderColor: showTemplates ? CS.tplBorder : CS.border }}
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
          <Pressable
            style={{ padding: 9, borderRadius: 10, backgroundColor: (chatInput.trim() || attachments.length > 0) ? CS.primary : '#F3F4F6' }}
            onPress={sendChat}
            disabled={chatLoading || (!chatInput.trim() && attachments.length === 0)}
          >
            {chatLoading
              ? <ActivityIndicator size="small" color={CS.primary} />
              : <Send size={18} color={(chatInput.trim() || attachments.length > 0) ? '#fff' : '#9CA3AF'} />}
          </Pressable>
        </View>
      </View>

      {/* ── 模型切换选择器 ──────────────────────────────── */}
      <Modal visible={showProviderPicker} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: CS.card, borderRadius: 16, width: '100%', overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CS.border }}>
              <Text style={{ color: CS.text, fontWeight: '700', fontSize: 16 }}>切换 AI 模型</Text>
              <Pressable onPress={() => setShowProviderPicker(false)}>
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

      {/* ── @引用选择器 ──────────────────────────────── */}
      <Modal visible={showAtPicker} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <View style={{ backgroundColor: CS.card, borderRadius: 16, width: '85%', maxWidth: 340, maxHeight: 360, overflow: 'hidden', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 10 }}>
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
            {atStep === 'blogger' && (
              <View style={{ maxHeight: 300 }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: CS.border }}>
                  <TextInput
                    value={atSearch.bloggerQuery}
                    onChangeText={(t) => setAtSearch((prev) => ({ ...prev, bloggerQuery: t }))}
                    placeholder="搜索博主..."
                    placeholderTextColor="#9CA3AF"
                    style={{ backgroundColor: CS.bg, borderWidth: 1, borderColor: CS.border, borderRadius: 8, color: CS.text, paddingHorizontal: 10, paddingVertical: 6, fontSize: 12 }}
                    autoCapitalize="none"
                  />
                </View>
                <FlatList
                  data={filteredBloggers}
                  keyExtractor={(b) => b.id}
                  style={{ maxHeight: 250 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable
                      style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CS.border }}
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
                  />
                </View>
                <FlatList
                  data={filteredWorks}
                  keyExtractor={(w) => w.id}
                  style={{ maxHeight: 250 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => (
                    <Pressable
                      style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: CS.border }}
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
    </KeyboardAvoidingView>
  );
}
