// AI详细分析视图 — 浅色主题 + 多彩模块排版
// 每个维度用不同颜色的标题块 + 白色答案区，直接填入内容不重复标题
import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { X, Copy, Check, ChevronDown, ChevronUp, Sparkles, RefreshCw } from 'lucide-react-native';

import { getAiAnalysis, generateAiAnalysis } from '@/lib/api';
import { AI_ANALYSIS_LABELS } from '@/lib/types';
import type { AiConfig, AiAnalysis, AiAnalysisContent } from '@/lib/types';

// 18 个维度的多彩配色（标题块背景色 + 文字色）
const DIMENSION_COLORS = [
  { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE' }, // 1 蓝
  { bg: '#F0FDF4', text: '#16A34A', border: '#BBF7D0' }, // 2 绿
  { bg: '#FFF7ED', text: '#EA580C', border: '#FED7AA' }, // 3 橙
  { bg: '#FDF4FF', text: '#C026D3', border: '#F5D0FE' }, // 4 品红
  { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA' }, // 5 红
  { bg: '#F0F9FF', text: '#0369A1', border: '#BAE6FD' }, // 6 天蓝
  { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' }, // 7 琥珀
  { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' }, // 8 紫
  { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' }, // 9 翠绿
  { bg: '#FFF1F2', text: '#E11D48', border: '#FFC9D0' }, // 10 玫瑰
  { bg: '#F0FDFA', text: '#0D9488', border: '#99F6E4' }, // 11 青色
  { bg: '#FAF5FF', text: '#9333EA', border: '#E9D5FF' }, // 12 深紫
  { bg: '#FFFEF7', text: '#CA8A04', border: '#FEF08A' }, // 13 金黄
  { bg: '#F8FAFC', text: '#475569', border: '#CBD5E1' }, // 14 石板灰
  { bg: '#FEF3C7', text: '#B45309', border: '#FCD34D' }, // 15 棕黄
  { bg: '#E0F2FE', text: '#0284C7', border: '#7DD3FC' }, // 16 浅蓝
  { bg: '#FCE7F3', text: '#BE185D', border: '#FBCFE8' }, // 17 粉红
  { bg: '#F1F5F9', text: '#334155', border: '#CBD5E1' }, // 18 深灰
];

// 将段落文本切分成多个条目
function parseToPoints(text: string): string[] {
  if (!text || !text.trim()) return [];

  let parts = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);

  if (parts.length <= 1) {
    const sentences = text
      .split(/(?<=[。；;！!？?])/)
      .map((s) => s.trim())
      .filter((s) => s.length > 2);
    if (sentences.length > 1) parts = sentences;
  }

  // 清理开头的标题前缀（如"开头钩子类型：xxx"去掉"开头钩子类型："）
  parts = parts.map((p) => {
    return p
      .replace(/^[•·\-—–\s]*\d+[.、)]\s*/, '')
      .replace(/^[，、\s·\-•]+/, '')
      .trim();
  });

  parts = parts.filter((p) => p.length > 2);
  return parts.length > 1 ? parts : [text.trim()];
}

// 去掉 AI 返回内容中重复的标题前缀（如"开头钩子类型：实际内容..."）
function stripTitlePrefix(text: string, title: string): string {
  if (!text) return text;
  // 去掉开头的 "标题：" 或 "标题："
  const prefixPattern = new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[：:\\s]*`, 'i');
  let cleaned = text.replace(prefixPattern, '').trim();
  // 也去掉「数字. 标题：」格式
  const numberedPattern = new RegExp(`^\\d+[.、)]\\s*${title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[：:\\s]*`, 'i');
  cleaned = cleaned.replace(numberedPattern, '').trim();
  return cleaned || text;
}

interface Props {
  workId: string;
  transcript: string;
  config: AiConfig | null;
  onClose: () => void;
}

export default function AiAnalysisView({ workId, transcript, config, onClose }: Props) {
  const [analysis, setAnalysis] = useState<AiAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(
    new Set(AI_ANALYSIS_LABELS.map((l) => l.key)),
  );

  const load = useCallback(async () => {
    setLoading(true);
    try { setAnalysis(await getAiAnalysis(workId)); }
    finally { setLoading(false); }
  }, [workId]);

  useEffect(() => { load(); }, [load]);

  const handleGenerate = async () => {
    if (!config) { setError('请先在设置中配置AI助手'); return; }
    if (!transcript) { setError('请先获取文案再生成分析'); return; }
    setGenerating(true); setError('');
    try {
      const a = await generateAiAnalysis(workId, transcript, config);
      setAnalysis(a);
      setExpandedKeys(new Set(AI_ANALYSIS_LABELS.map((l) => l.key)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'AI分析失败，请重试');
    } finally { setGenerating(false); }
  };

  const handleCopyAll = async () => {
    if (!analysis?.content) return;
    const text = AI_ANALYSIS_LABELS
      .filter((l) => l.key !== 'raw')
      .map((l) => {
        const val = (analysis.content as AiAnalysisContent)[l.key];
        if (!val) return '';
        const cleaned = stripTitlePrefix(val, l.label);
        const points = parseToPoints(cleaned);
        if (points.length > 1) {
          const numbered = points.map((p, i) => `${i + 1}. ${p}`).join('\n');
          return `【${l.label}】\n${numbered}`;
        }
        return `【${l.label}】\n${cleaned}`;
      })
      .filter(Boolean)
      .join('\n\n');
    await Clipboard.setStringAsync(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const toggleExpand = (key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      {/* 顶部栏 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E4E8EF' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={18} color="#7C3AED" />
          </View>
          <Text style={{ color: '#1A1D23', fontSize: 18, fontWeight: '700' }}>AI 文风分析</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          {analysis && (
            <Pressable style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }} onPress={handleCopyAll}>
              {copied ? <Check size={17} color="#2563EB" /> : <Copy size={17} color="#6B7280" />}
              <Text style={{ color: copied ? '#2563EB' : '#6B7280', fontSize: 13, fontWeight: '500' }}>{copied ? '已复制' : '全部复制'}</Text>
            </Pressable>
          )}
          <Pressable onPress={onClose} style={{ padding: 4 }}>
            <X size={22} color="#6B7280" />
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }} contentInsetAdjustmentBehavior="automatic">
          <View style={{ padding: 16, gap: 10 }}>

            {/* 未生成 */}
            {!analysis && !generating && (
              <View style={{ gap: 14 }}>
                {!config && (
                  <View style={{ backgroundColor: '#FEF9C3', borderRadius: 12, padding: 14 }}>
                    <Text style={{ color: '#854D0E', fontSize: 13 }}>请先在"设置"中配置 AI 助手 API</Text>
                  </View>
                )}
                {!transcript && (
                  <View style={{ backgroundColor: '#FEF9C3', borderRadius: 12, padding: 14 }}>
                    <Text style={{ color: '#854D0E', fontSize: 13 }}>请先在"文案"Tab 中获取文案</Text>
                  </View>
                )}
                {config && transcript && (
                  <View style={{ alignItems: 'center', gap: 12, marginTop: 32, marginBottom: 16 }}>
                    <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: '#F5F3FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Sparkles size={36} color="#7C3AED" />
                    </View>
                    <Text style={{ color: '#1A1D23', fontSize: 16, fontWeight: '600', textAlign: 'center' }}>18维度文风深度分析</Text>
                    <Text style={{ color: '#6B7280', fontSize: 13, textAlign: 'center', paddingHorizontal: 20 }}>
                      涵盖标题分析、钩子类型、语言DNA、爆点因素等专业维度，每项分点呈现
                    </Text>
                  </View>
                )}
                {error ? <Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text> : null}
                {config && transcript && (
                  <Pressable cssInterop={false}
                    style={{ backgroundColor: '#7C3AED', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
                    onPress={handleGenerate}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>开始生成分析</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* 生成中 */}
            {generating && (
              <View style={{ alignItems: 'center', gap: 16, marginTop: 60 }}>
                <ActivityIndicator size="large" color="#7C3AED" />
                <Text style={{ color: '#1A1D23', fontWeight: '600', fontSize: 15 }}>AI 分析中，请稍候…</Text>
                <Text style={{ color: '#6B7280', fontSize: 13 }}>正在分析 18 个维度，约需 15-30 秒</Text>
              </View>
            )}

            {/* 分析结果 — 多彩模块 */}
            {analysis && !generating && (
              <View style={{ gap: 10 }}>
                {/* 时间 + 重新生成 */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ color: '#6B7280', fontSize: 12 }}>
                    生成于 {new Date(analysis.created_at).toLocaleString('zh-CN')}
                  </Text>
                  <Pressable cssInterop={false}
                    style={{flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#E4E8EF', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6}}
                    onPress={handleGenerate}
                  >
                    <RefreshCw size={13} color="#6B7280" />
                    <Text style={{ color: '#6B7280', fontSize: 12 }}>重新生成</Text>
                  </Pressable>
                </View>
                {error ? <Text style={{ color: '#DC2626', fontSize: 13 }}>{error}</Text> : null}

                {AI_ANALYSIS_LABELS.map((item, index) => {
                  const rawValue = (analysis.content as AiAnalysisContent)?.[item.key];
                  if (!rawValue || item.key === 'raw') return null;
                  const colorScheme = DIMENSION_COLORS[index % DIMENSION_COLORS.length];
                  const expanded = expandedKeys.has(item.key);
                  // 去掉 AI 返回内容中重复的标题
                  const value = stripTitlePrefix(rawValue, item.label);
                  const points = parseToPoints(value);
                  const hasMultiple = points.length > 1;

                  return (
                    <View key={item.key} style={{
                      backgroundColor: '#FFFFFF',
                      borderRadius: 12,
                      overflow: 'hidden',
                      borderWidth: 1,
                      borderColor: colorScheme.border,
                    }}>
                      {/* 彩色标题块 */}
                      <Pressable cssInterop={false}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingHorizontal: 14,
                          paddingVertical: 12,
                          backgroundColor: colorScheme.bg,
                        }}
                        onPress={() => toggleExpand(item.key)}
                      >
                        <View style={{
                          width: 24, height: 24, borderRadius: 6,
                          backgroundColor: colorScheme.text,
                          alignItems: 'center', justifyContent: 'center',
                          marginRight: 10,
                        }}>
                          <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>{index + 1}</Text>
                        </View>
                        <Text style={{ flex: 1, color: colorScheme.text, fontWeight: '700', fontSize: 14 }}>{item.label}</Text>
                        {hasMultiple && (
                          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, marginRight: 6, borderWidth: 1, borderColor: colorScheme.border }}>
                            <Text style={{ color: colorScheme.text, fontSize: 10, fontWeight: '600' }}>{points.length} 条</Text>
                          </View>
                        )}
                        {expanded
                          ? <ChevronUp size={16} color={colorScheme.text} />
                          : <ChevronDown size={16} color={colorScheme.text} />}
                      </Pressable>

                      {/* 白色答案区 — 直接填入内容 */}
                      {expanded && (
                        <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
                          {hasMultiple ? (
                            <View style={{ gap: 10 }}>
                              {points.map((p, i) => (
                                <View key={i} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start' }}>
                                  <View style={{
                                    width: 22, height: 22, borderRadius: 11,
                                    backgroundColor: colorScheme.bg,
                                    borderWidth: 1,
                                    borderColor: colorScheme.border,
                                    alignItems: 'center', justifyContent: 'center',
                                    marginTop: 2, flexShrink: 0,
                                  }}>
                                    <Text style={{ color: colorScheme.text, fontSize: 11, fontWeight: '700' }}>{i + 1}</Text>
                                  </View>
                                  <Text style={{ color: '#1A1D23', fontSize: 14, lineHeight: 24, flex: 1 }}>{p}</Text>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={{ color: '#1A1D23', fontSize: 14, lineHeight: 24 }}>{value}</Text>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}

                {/* 底部复制 */}
                <Pressable cssInterop={false}
                  style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#2563EB', borderRadius: 12, paddingVertical: 13, marginTop: 6}}
                  onPress={handleCopyAll}
                >
                  {copied ? <Check size={16} color="#2563EB" /> : <Copy size={16} color="#2563EB" />}
                  <Text style={{ color: '#2563EB', fontSize: 14, fontWeight: '600' }}>
                    {copied ? '已复制全部内容' : '一键复制全部分析'}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
