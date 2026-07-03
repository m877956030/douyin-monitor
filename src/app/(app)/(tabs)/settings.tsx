// 设置页 — AI提供商管理 + 抖音Cookie + 写作模板
import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  FlatList,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  Bot, ChevronRight, CheckCircle, XCircle, ChevronDown,
  Cookie, Eye, EyeOff, Check, Plus, Trash2, Pencil,
  Star, FileText, X, Globe,
} from 'lucide-react-native';
import {
  getAiProviders, saveAiProvider, setActiveAiProvider, deleteAiProvider,
  testAiConnection, getDouyinCookie, saveDouyinCookie,
  getWritingTemplates, saveWritingTemplate, deleteWritingTemplate,
  getSiliconFlowKey, saveSiliconFlowKey,
  getLocalServerConfig, saveLocalServerHost, saveLocalServerPort,
  saveLocalTranscribeEngine,
  getWebSearchKey, saveWebSearchKey,
} from '@/lib/api';
import type { AiProvider, WritingTemplate } from '@/lib/types';

// ─── 浅色面板通用色 ─────────────────────────────────────────
const S = {
  bg: '#F5F7FA',
  card: '#FFFFFF',
  border: '#E4E8EF',
  text: '#1A1D23',
  sub: '#6B7280',
  primary: '#2563EB',
  primaryBg: '#EFF6FF',
  danger: '#DC2626',
  dangerBg: '#FEF2F2',
  success: '#16A34A',
};

export default function SettingsScreen() {
  const [providers, setProviders] = useState<AiProvider[]>([]);
  const [cookie, setCookie] = useState('');
  const [sfKey, setSfKey] = useState('');
  const [showSfKey, setShowSfKey] = useState(false);
  const [savingSf, setSavingSf] = useState(false);
  const [sfSaved, setSfSaved] = useState(false);
  const [templates, setTemplates] = useState<WritingTemplate[]>([]);

  // 联网搜索
  const [webSearchKey, setWebSearchKey] = useState('');
  const [showWebSearchKey, setShowWebSearchKey] = useState(false);
  const [savingWebSearch, setSavingWebSearch] = useState(false);
  const [webSearchSaved, setWebSearchSaved] = useState(false);

  // 本地转录服务器
  const [localHost, setLocalHost] = useState('');
  const [localPort, setLocalPort] = useState('3000');
  const [localEngine, setLocalEngine] = useState('siliconflow');
  const [localSaved, setLocalSaved] = useState(false);
  const [savingLocal, setSavingLocal] = useState(false);

  // Cookie 弹窗
  const [showCookieModal, setShowCookieModal] = useState(false);
  const [cookieInput, setCookieInput] = useState('');
  const [showCookieText, setShowCookieText] = useState(false);
  const [savingCookie, setSavingCookie] = useState(false);
  const [cookieSaved, setCookieSaved] = useState(false);
  const scrollRef = useRef(null);

  // AI提供商弹窗
  const [showProviderModal, setShowProviderModal] = useState(false);
  const [editProvider, setEditProvider] = useState<Partial<AiProvider> | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [apiEndpoint, setApiEndpoint] = useState('');
  const [providerName, setProviderName] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [models, setModels] = useState<{ id: string; name: string }[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // 写作模板弹窗
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [editTemplate, setEditTemplate] = useState<Partial<WritingTemplate> | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplContent, setTplContent] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  const loadAll = useCallback(async () => {
    const [provs, ck, tpls, sf, localCfg, wsKey] = await Promise.all([
      getAiProviders(),
      getDouyinCookie(),
      getWritingTemplates(),
      getSiliconFlowKey(),
      getLocalServerConfig(),
      getWebSearchKey(),
    ]);
    setProviders(provs);
    setCookie(ck || '');
    setTemplates(tpls);
    setSfKey(sf || '');
    setLocalHost(localCfg.host || '');
    setLocalPort(String(localCfg.port || 3000));
    setLocalEngine(localCfg.engine || 'siliconflow');
    setWebSearchKey(wsKey || '');
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, [loadAll]));

  // ── Cookie ────────────────────────────────────────────────
  const handleSaveCookie = async () => {
    setSavingCookie(true);
    try {
      await saveDouyinCookie(cookieInput.trim());
      setCookie(cookieInput.trim());
      setCookieSaved(true);
      setTimeout(() => { setCookieSaved(false); setShowCookieModal(false); }, 1200);
    } finally { setSavingCookie(false); }
  };

  // ── AI Provider ──────────────────────────────────────────
  const openAddProvider = () => {
    setEditProvider(null);
    setProviderName('');
    setApiKey('');
    setApiEndpoint('');
    setModels([]);
    setSelectedModel('');
    setTestResult(null);
    setSaveMsg('');
    setShowProviderModal(true);
  };

  const openEditProvider = (p: AiProvider) => {
    setEditProvider(p);
    setProviderName(p.name);
    setApiKey(p.api_key);
    setApiEndpoint(p.api_endpoint);
    setModels(p.available_models || []);
    setSelectedModel(p.selected_model || '');
    setTestResult(null);
    setSaveMsg('');
    setShowProviderModal(true);
  };

  const handleTest = async () => {
    if (!apiKey.trim() || !apiEndpoint.trim()) {
      setTestResult({ success: false, error: '请填写接口地址和 API Key' });
      return;
    }
    setTesting(true); setTestResult(null);
    try {
      const result = await testAiConnection(apiKey.trim(), apiEndpoint.trim());
      setTestResult(result);
      if (result.success && result.models) {
        setModels(result.models);
        if (result.models.length > 0 && !selectedModel) setSelectedModel(result.models[0].id);
      }
    } catch (e: unknown) {
      setTestResult({ success: false, error: e instanceof Error ? e.message : '连接失败' });
    } finally { setTesting(false); }
  };

  const handleSaveProvider = async () => {
    if (!providerName.trim() || !apiKey.trim() || !apiEndpoint.trim() || !selectedModel) {
      setSaveMsg('请填写名称、验证 API 并选择模型');
      return;
    }
    setSaving(true);
    try {
      await saveAiProvider({
        name: providerName.trim(),
        api_key: apiKey.trim(),
        api_endpoint: apiEndpoint.trim(),
        selected_model: selectedModel,
        available_models: models,
        is_active: providers.length === 0,
        sort_order: editProvider?.sort_order ?? providers.length,
      }, editProvider?.id);
      await loadAll();
      setShowProviderModal(false);
    } catch { setSaveMsg('保存失败，请重试'); } finally { setSaving(false); }
  };

  const handleSetActive = async (id: string) => {
    await setActiveAiProvider(id);
    await loadAll();
  };

  const handleDeleteProvider = async (id: string) => {
    await deleteAiProvider(id);
    await loadAll();
  };

  // ── Writing Template ──────────────────────────────────────
  const openAddTemplate = () => {
    setEditTemplate(null); setTplName(''); setTplContent(''); setShowTemplateModal(true);
  };
  const openEditTemplate = (t: WritingTemplate) => {
    setEditTemplate(t); setTplName(t.name); setTplContent(t.content); setShowTemplateModal(true);
  };
  const handleSaveTemplate = async () => {
    if (!tplName.trim() || !tplContent.trim()) return;
    setSavingTpl(true);
    try {
      await saveWritingTemplate({ name: tplName.trim(), content: tplContent.trim() }, editTemplate?.id);
      await loadAll();
      setShowTemplateModal(false);
    } finally { setSavingTpl(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: S.bg }}>
      {/* 头部 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: S.card, borderBottomWidth: 1, borderBottomColor: S.border }}>
        <Text style={{ color: S.text, fontSize: 22, fontWeight: '700' }}>设置</Text>
      </View>

      <ScrollView contentInsetAdjustmentBehavior="automatic">
        {/* ── 抖音 Cookie ────────────────────────────────── */}
        <View style={{ marginTop: 20, marginHorizontal: 16 }}>
          <Text style={{ color: S.sub, fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            数据采集
          </Text>
          <View style={{ backgroundColor: S.card, borderRadius: 12, borderWidth: 1, borderColor: S.border, overflow: 'hidden' }}>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', padding: 16}}
              onPress={() => { setCookieInput(cookie); setShowCookieText(false); setCookieSaved(false); setShowCookieModal(true); }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: S.primaryBg, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                <Cookie size={18} color={S.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: S.text, fontWeight: '600', fontSize: 15 }}>抖音 Cookie</Text>
                <Text style={{ color: S.sub, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                  {cookie ? `已配置 · ${cookie.length} 字符` : '点击配置，用于获取博主数据'}
                </Text>
              </View>
              <ChevronRight size={16} color={S.sub} />
            </Pressable>
          </View>
        </View>

        {/* ── AI 提供商 ────────────────────────────────────── */}
        <View style={{ marginTop: 24, marginHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: S.sub, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>AI 提供商</Text>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: S.primaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8}}
              onPress={openAddProvider}
            >
              <Plus size={14} color={S.primary} />
              <Text style={{ color: S.primary, fontSize: 13, fontWeight: '600' }}>添加</Text>
            </Pressable>
          </View>

          {providers.length === 0 ? (
            <View style={{ backgroundColor: S.card, borderRadius: 12, borderWidth: 1, borderColor: S.border, padding: 24, alignItems: 'center' }}>
              <Bot size={32} color="#D1D5DB" />
              <Text style={{ color: S.sub, fontSize: 14, marginTop: 8 }}>暂无 AI 配置</Text>
              <Text style={{ color: S.sub, fontSize: 12, marginTop: 4 }}>点击"添加"接入 DeepSeek、Claude 等</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: S.card, borderRadius: 12, borderWidth: 1, borderColor: S.border, overflow: 'hidden' }}>
              {providers.map((p, idx) => (
                <View key={p.id} style={{ borderBottomWidth: idx < providers.length - 1 ? 1 : 0, borderBottomColor: S.border }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: p.is_active ? S.primaryBg : '#F3F4F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      <Bot size={18} color={p.is_active ? S.primary : '#9CA3AF'} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Text style={{ color: S.text, fontWeight: '600', fontSize: 15 }}>{p.name}</Text>
                        {p.is_active && (
                          <View style={{ backgroundColor: S.primaryBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                            <Text style={{ color: S.primary, fontSize: 11, fontWeight: '600' }}>使用中</Text>
                          </View>
                        )}
                      </View>
                      <Text style={{ color: S.sub, fontSize: 12, marginTop: 2 }} numberOfLines={1}>
                        {p.selected_model || p.api_endpoint}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {!p.is_active && (
                        <Pressable
                          style={{ padding: 8, borderRadius: 8, backgroundColor: '#F9FAFB'}}
                          onPress={() => handleSetActive(p.id)}
                        >
                          <Star size={16} color="#9CA3AF" />
                        </Pressable>
                      )}
                      <Pressable
                        style={{ padding: 8, borderRadius: 8, backgroundColor: '#F9FAFB'}}
                        onPress={() => openEditProvider(p)}
                      >
                        <Pencil size={16} color={S.sub} />
                      </Pressable>
                      <Pressable
                        style={{ padding: 8, borderRadius: 8, backgroundColor: S.dangerBg}}
                        onPress={() => handleDeleteProvider(p.id)}
                      >
                        <Trash2 size={16} color={S.danger} />
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── 写作风格模板 ──────────────────────────────────── */}
        <View style={{ marginTop: 24, marginHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Text style={{ color: S.sub, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>写作风格模板</Text>
            <Pressable
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: S.primaryBg, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8}}
              onPress={openAddTemplate}
            >
              <Plus size={14} color={S.primary} />
              <Text style={{ color: S.primary, fontSize: 13, fontWeight: '600' }}>添加</Text>
            </Pressable>
          </View>
          <Text style={{ color: S.sub, fontSize: 12, marginBottom: 10 }}>
            在 AI 对话界面，可快速选择模板插入到输入框中
          </Text>

          {templates.length === 0 ? (
            <View style={{ backgroundColor: S.card, borderRadius: 12, borderWidth: 1, borderColor: S.border, padding: 24, alignItems: 'center' }}>
              <FileText size={32} color="#D1D5DB" />
              <Text style={{ color: S.sub, fontSize: 14, marginTop: 8 }}>暂无写作模板</Text>
              <Text style={{ color: S.sub, fontSize: 12, marginTop: 4 }}>添加常用文风提示词，对话时一键调用</Text>
            </View>
          ) : (
            <View style={{ backgroundColor: S.card, borderRadius: 12, borderWidth: 1, borderColor: S.border, overflow: 'hidden' }}>
              {templates.map((t, idx) => (
                <View key={t.id} style={{ borderBottomWidth: idx < templates.length - 1 ? 1 : 0, borderBottomColor: S.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: S.text, fontWeight: '600', fontSize: 14 }}>{t.name}</Text>
                    <Text style={{ color: S.sub, fontSize: 12, marginTop: 2 }} numberOfLines={2}>{t.content}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 6, marginLeft: 8 }}>
                    <Pressable
                      style={{ padding: 7, borderRadius: 8, backgroundColor: '#F9FAFB'}}
                      onPress={() => openEditTemplate(t)}
                    >
                      <Pencil size={15} color={S.sub} />
                    </Pressable>
                    <Pressable
                      style={{ padding: 7, borderRadius: 8, backgroundColor: S.dangerBg}}
                      onPress={() => deleteWritingTemplate(t.id).then(loadAll)}
                    >
                      <Trash2 size={15} color={S.danger} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>

        {/* ── 语音识别（硅基流动）──────────────────────────── */}
        <View style={{ marginTop: 24, marginHorizontal: 16 }}>
          <Text style={{ color: S.sub, fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            语音识别（逐字稿转录）
          </Text>
          <View style={{ backgroundColor: S.card, borderRadius: 12, borderWidth: 1, borderColor: S.border, padding: 16, gap: 12 }}>
            <Text style={{ color: S.sub, fontSize: 12, lineHeight: 20 }}>
              配置硅基流动 API Key 后，获取文案时将自动调用 SenseVoiceSmall 模型转录视频音频，生成完整逐字稿。
              {'\n'}免费注册：siliconflow.cn
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={showSfKey ? sfKey : (sfKey ? sfKey.slice(0, 8) + '••••••••' + sfKey.slice(-4) : '')}
                onChangeText={setSfKey}
                placeholder="sk-xxxxxxxxxxxxxxxxxxxxxxxx"
                placeholderTextColor="#9CA3AF"
                editable={showSfKey}
                style={{ flex: 1, backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 }}
              />
              <Pressable onPress={() => setShowSfKey((v) => !v)} style={{ padding: 10, borderRadius: 10, backgroundColor: S.bg, borderWidth: 1, borderColor: S.border }}>
                {showSfKey ? <EyeOff size={18} color={S.sub} /> : <Eye size={18} color={S.sub} />}
              </Pressable>
            </View>
            <Pressable
              style={{ backgroundColor: sfSaved ? '#16A34A' : S.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: savingSf ? 0.7 : 1 }}
              onPress={async () => {
                setSavingSf(true);
                await saveSiliconFlowKey(sfKey.trim());
                setSfSaved(true);
                setTimeout(() => setSfSaved(false), 2000);
                setSavingSf(false);
              }}
              disabled={savingSf}
            >
              {savingSf
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{sfSaved ? '✓ 已保存' : '保存 API Key'}</Text>}
            </Pressable>
          </View>
        </View>

        {/* ── 联网搜索（Tavily） ─────────────────────────────── */}
        <View style={{ marginTop: 24, marginHorizontal: 16 }}>
          <Text style={{ color: S.sub, fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            联网搜索（Tavily）
          </Text>
          <View style={{ backgroundColor: S.card, borderRadius: 12, borderWidth: 1, borderColor: S.border, padding: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
              <Globe size={16} color={S.primary} style={{ marginTop: 2 }} />
              <Text style={{ color: S.sub, fontSize: 12, lineHeight: 20, flex: 1 }}>
                配置 Tavily API Key 后，AI 对话时可开启「联网搜索」功能。AI 将自动搜索互联网获取最新信息，回答更准确。
                {'\n'}注册地址：{' '}
                <Text style={{ color: S.primary }}>https://tavily.com</Text>
                {'\n'}免费用户每月 1000 次搜索。
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={showWebSearchKey ? webSearchKey : (webSearchKey ? webSearchKey.slice(0, 8) + '••••••••' + webSearchKey.slice(-4) : '')}
                onChangeText={setWebSearchKey}
                placeholder="tvly-xxxxxxxx"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showWebSearchKey}
                style={{ flex: 1, backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Pressable onPress={() => setShowWebSearchKey((v) => !v)} style={{ padding: 8 }}>
                {showWebSearchKey ? <EyeOff size={18} color={S.sub} /> : <Eye size={18} color={S.sub} />}
              </Pressable>
            </View>
            <Pressable
              style={{ backgroundColor: webSearchSaved ? '#16A34A' : S.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: savingWebSearch ? 0.7 : 1 }}
              onPress={async () => {
                setSavingWebSearch(true);
                await saveWebSearchKey(webSearchKey.trim());
                setWebSearchSaved(true);
                setTimeout(() => setWebSearchSaved(false), 2000);
                setSavingWebSearch(false);
              }}
              disabled={savingWebSearch}
            >
              {savingWebSearch
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{webSearchSaved ? '✓ 已保存' : '保存 API Key'}</Text>}
            </Pressable>
          </View>
        </View>

        {/* ── 本地转录服务器（接口三） ─────────────────────── */}
        <View style={{ marginTop: 24, marginHorizontal: 16 }}>
          <Text style={{ color: S.sub, fontSize: 12, fontWeight: '600', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            本地转录服务器（接口三）
          </Text>
          <View style={{ backgroundColor: S.card, borderRadius: 12, borderWidth: 1, borderColor: S.border, padding: 16, gap: 12 }}>
            <Text style={{ color: S.sub, fontSize: 12, lineHeight: 20 }}>
              在电脑上运行本地服务器，利用 FFmpeg 下载视频并提取纯音频后转录。
              电脑和手机需要在同一局域网，电脑需安装 FFmpeg 和 Node.js 18+。
              {'\n'}服务器启动后在此填入电脑的局域网 IP 和端口号。
            </Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                value={localHost}
                onChangeText={setLocalHost}
                placeholder="IP 地址（如 192.168.1.100）"
                placeholderTextColor="#9CA3AF"
                style={{ flex: 2, backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                value={localPort}
                onChangeText={setLocalPort}
                placeholder="端口"
                placeholderTextColor="#9CA3AF"
                keyboardType="number-pad"
                style={{ flex: 1, backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13 }}
              />
            </View>
            {/* 转录引擎选择 */}
            <Text style={{ color: S.sub, fontSize: 12, fontWeight: '500', marginTop: 4 }}>转录引擎</Text>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[
                { key: 'siliconflow', label: '硅基流动' },
                { key: 'local_whisper', label: '本地Whisper' },
              ].map(opt => (
                <Pressable
                  key={opt.key}
                  style={{
                    flex: 1,
                    backgroundColor: localEngine === opt.key ? S.primary : S.bg,
                    borderRadius: 8,
                    paddingVertical: 8,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: localEngine === opt.key ? S.primary : S.border,
                  }}
                  onPress={() => setLocalEngine(opt.key)}
                >
                  <Text style={{ color: localEngine === opt.key ? '#fff' : S.text, fontSize: 11, fontWeight: '600' }}>{opt.label}</Text>
                </Pressable>
              ))}
            </View>
            <Pressable
              style={{ backgroundColor: localSaved ? '#16A34A' : S.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: savingLocal ? 0.7 : 1 }}
              onPress={async () => {
                setSavingLocal(true);
                await Promise.all([
                  saveLocalServerHost(localHost.trim()),
                  saveLocalServerPort(localPort.trim()),
                  saveLocalTranscribeEngine(localEngine),
                ]);
                setLocalSaved(true);
                setTimeout(() => setLocalSaved(false), 2000);
                setSavingLocal(false);
              }}
              disabled={savingLocal}
            >
              {savingLocal
                ? <ActivityIndicator size="small" color="#fff" />
                : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>{localSaved ? '✓ 已保存' : '保存配置'}</Text>}
            </Pressable>
            <Pressable
              style={{ borderWidth: 1, borderColor: localHost.trim() ? S.primary : '#D1D5DB', borderRadius: 10, paddingVertical: 10, alignItems: 'center', opacity: localHost.trim() ? 1 : 0.5 }}
              onPress={async () => {
                if (!localHost.trim()) {
                  Alert.alert('提示', '请先填写服务器地址（IP）');
                  return;
                }
                try {
                  const r = await fetch(`http://${localHost.trim()}:${localPort}/ping`);
                  const d = await r.json();
                  Alert.alert('连接成功', `服务器连接成功！\nFFmpeg: ${d.ffmpeg ? '✓' : '✗ 未安装'}\nNode: ${d.node_version}`);
                } catch {
                  Alert.alert('连接失败', '请确认电脑端转录服务已启动');
                }
              }}
            >
              <Text style={{ color: localHost.trim() ? S.primary : '#9CA3AF', fontSize: 13, fontWeight: '600' }}>测试连接</Text>
            </Pressable>
          </View>
        </View>

        {/* ── 使用说明 ──────────────────────────────────────── */}
        <View style={{ marginHorizontal: 16, marginTop: 24, backgroundColor: S.card, borderRadius: 12, borderWidth: 1, borderColor: S.border, padding: 16 }}>
          <Text style={{ color: S.text, fontWeight: '600', fontSize: 14, marginBottom: 8 }}>使用说明</Text>
          <Text style={{ color: S.sub, fontSize: 13, lineHeight: 22 }}>
            {'1. 配置抖音 Cookie 后，添加博主链接即可自动获取数据\n'}
            {'2. 可添加多个 AI 提供商，点击星形图标切换当前使用的 AI\n'}
            {'3. 支持 DeepSeek、OpenAI、Claude 等任意兼容 OpenAI 协议的接口\n'}
            {'4. 配置硅基流动 Key 后可获取完整逐字稿（实际音频转录）\n'}
            {'5. 写作风格模板可在 AI 对话时快速插入，提升提问效率\n'}
            {'6. 配置本地转录服务器后，作品详情页会出现「接口三：本地转录」按钮'}
          </Text>
        </View>

        <View style={{ alignItems: 'center', marginTop: 24, marginBottom: 40 }}>
          <Text style={{ color: '#CBD5E1', fontSize: 12 }}>抖音知识库 v2.0</Text>
        </View>
      </ScrollView>

      {/* ── Cookie 弹窗 - 返回自动保存 ────────────────────── */}
      <Modal visible={showCookieModal} transparent animationType="slide" onShow={() => {
        // 弹窗打开时自动跳到顶部
        setTimeout(() => { try { scrollRef.current?.scrollTo?.({ y: 0, animated: false }); } catch {} }, 100);
      }}>
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: S.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, maxHeight: '90%', minHeight: '60%' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <Text style={{ color: S.text, fontSize: 18, fontWeight: '700' }}>配置抖音 Cookie</Text>
                <Pressable
                  onPress={async () => {
                    if (cookieInput.trim()) {
                      setSavingCookie(true);
                      try {
                        await saveDouyinCookie(cookieInput.trim());
                        setCookie(cookieInput.trim());
                      } catch {}
                      setSavingCookie(false);
                    }
                    setShowCookieModal(false);
                  }}
                  className="active:opacity-60"
                >
                  <X size={22} color={S.sub} />
                </Pressable>
              </View>
              <ScrollView
                ref={scrollRef}
                style={{ flex: 1 }}
                contentContainerStyle={{ flexGrow: 1 }}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={true}
              >
                <View style={{ flex: 1, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Text style={{ color: S.sub, fontSize: 13 }}>Cookie 内容（关闭时自动保存）</Text>
                    <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }} onPress={() => setShowCookieText(v => !v)}>
                      {showCookieText ? <EyeOff size={14} color={S.sub} /> : <Eye size={14} color={S.sub} />}
                      <Text style={{ color: S.sub, fontSize: 12 }}>{showCookieText ? '隐藏' : '显示'}</Text>
                    </Pressable>
                  </View>
                  <TextInput
                    value={cookieInput}
                    onChangeText={setCookieInput}
                    placeholder="粘贴完整 Cookie 内容..."
                    placeholderTextColor="#9CA3AF"
                    multiline
                    autoFocus
                    secureTextEntry={!showCookieText}
                    style={{ backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, minHeight: 150, textAlignVertical: 'top' }}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {cookieInput.length > 0 && (
                    <Text style={{ color: S.sub, fontSize: 12, textAlign: 'right' }}>{cookieInput.length} 字符</Text>
                  )}
                  <Text style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 16 }}>
                    提示：在抖音网页版登录后，按 F12 → Application → Cookies → 复制全部 Cookie。关闭本窗口自动保存。
                  </Text>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI 提供商弹窗 ─────────────────────────────────── */}
      <Modal visible={showProviderModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: S.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '92%', paddingTop: 20, paddingHorizontal: 20, paddingBottom: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <Text style={{ color: S.text, fontSize: 18, fontWeight: '700' }}>{editProvider?.id ? '编辑 AI 提供商' : '添加 AI 提供商'}</Text>
                <Pressable onPress={() => setShowProviderModal(false)} className="active:opacity-60">
                  <X size={22} color={S.sub} />
                </Pressable>
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} style={{ marginBottom: 20 }}>
                <View style={{ gap: 14 }}>
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: S.sub, fontSize: 13, fontWeight: '500' }}>显示名称</Text>
                    <TextInput value={providerName} onChangeText={setProviderName} placeholder="例如：DeepSeek 主力" placeholderTextColor="#9CA3AF" style={{ backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 }} />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: S.sub, fontSize: 13, fontWeight: '500' }}>接口地址（Base URL）</Text>
                    <TextInput value={apiEndpoint} onChangeText={(t) => { setApiEndpoint(t); setTestResult(null); }} placeholder="例如：https://api.deepseek.com/v1" placeholderTextColor="#9CA3AF" style={{ backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 }} autoCapitalize="none" autoCorrect={false} />
                  </View>
                  <View style={{ gap: 6 }}>
                    <Text style={{ color: S.sub, fontSize: 13, fontWeight: '500' }}>API Key</Text>
                    <TextInput value={apiKey} onChangeText={(t) => { setApiKey(t); setTestResult(null); }} placeholder="sk-xxxxxxxxxxxx" placeholderTextColor="#9CA3AF" style={{ backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 }} autoCapitalize="none" autoCorrect={false} secureTextEntry />
                  </View>

                  <Pressable
                    style={{ borderWidth: 1, borderColor: S.primary, borderRadius: 10, paddingVertical: 12, alignItems: 'center'}}
                    onPress={handleTest}
                    disabled={testing}
                  >
                    {testing ? <ActivityIndicator size="small" color={S.primary} /> : <Text style={{ color: S.primary, fontWeight: '600', fontSize: 14 }}>验证 API 连接</Text>}
                  </Pressable>

                  {testResult && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      {testResult.success
                        ? <><CheckCircle size={16} color={S.success} /><Text style={{ color: S.success, fontSize: 13 }}>连接成功，已获取模型列表</Text></>
                        : <><XCircle size={16} color={S.danger} /><Text style={{ color: S.danger, fontSize: 13, flex: 1 }}>{testResult.error || '连接失败'}</Text></>}
                    </View>
                  )}

                  {models.length > 0 && (
                    <View style={{ gap: 6 }}>
                      <Text style={{ color: S.sub, fontSize: 13, fontWeight: '500' }}>选择模型</Text>
                      <Pressable
                        style={{ backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}}
                        onPress={() => setShowModelPicker(!showModelPicker)}
                      >
                        <Text style={{ color: selectedModel ? S.text : '#9CA3AF', fontSize: 14, flex: 1 }}>{selectedModel || '请选择模型'}</Text>
                        <ChevronDown size={16} color={S.sub} />
                      </Pressable>
                      {showModelPicker && (
                        <View style={{ backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, overflow: 'hidden' }}>
                          {models.map((m) => (
                            <Pressable key={m.id} style={{ paddingHorizontal: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: S.border}} onPress={() => { setSelectedModel(m.id); setShowModelPicker(false); }}>
                              <Text style={{ color: selectedModel === m.id ? S.primary : S.text, fontSize: 14, fontWeight: selectedModel === m.id ? '600' : '400' }}>{m.name || m.id}</Text>
                            </Pressable>
                          ))}
                        </View>
                      )}
                    </View>
                  )}

                  {saveMsg ? <Text style={{ color: S.danger, fontSize: 13 }}>{saveMsg}</Text> : null}

                  <Pressable
                    style={{ backgroundColor: S.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4}}
                    onPress={handleSaveProvider}
                    disabled={saving}
                  >
                    {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>保存配置</Text>}
                  </Pressable>
                </View>
              </ScrollView>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 写作模板弹窗 ──────────────────────────────────── */}
      <Modal visible={showTemplateModal} transparent animationType="slide">
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: S.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36, gap: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: S.text, fontSize: 18, fontWeight: '700' }}>{editTemplate?.id ? '编辑模板' : '添加写作模板'}</Text>
                <Pressable onPress={() => setShowTemplateModal(false)} className="active:opacity-60"><X size={22} color={S.sub} /></Pressable>
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ color: S.sub, fontSize: 13, fontWeight: '500' }}>模板名称</Text>
                <TextInput value={tplName} onChangeText={setTplName} placeholder="例如：小红书文风、情感故事体" placeholderTextColor="#9CA3AF" style={{ backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 }} />
              </View>
              <View style={{ gap: 6 }}>
                <Text style={{ color: S.sub, fontSize: 13, fontWeight: '500' }}>模板内容</Text>
                <TextInput value={tplContent} onChangeText={setTplContent} placeholder="请用以下风格改写：语言活泼、多用短句、结尾有互动..." placeholderTextColor="#9CA3AF" multiline style={{ backgroundColor: S.bg, borderWidth: 1, borderColor: S.border, borderRadius: 10, color: S.text, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, minHeight: 100, textAlignVertical: 'top' }} />
              </View>
              <Pressable
                style={{ backgroundColor: S.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', opacity: (!tplName.trim() || !tplContent.trim()) ? 0.7 : 1 }}
                onPress={handleSaveTemplate}
                disabled={savingTpl || !tplName.trim() || !tplContent.trim()}
              >
                {savingTpl ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>保存模板</Text>}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
