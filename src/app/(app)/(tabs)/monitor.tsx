// 监控页：展示今日所有关注博主的最新作品
import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
  Animated,
  Alert,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Image } from 'expo-image';
import { RefreshCw, Radio, TrendingUp, Clock, ArrowUp, ArrowDown, Minus } from 'lucide-react-native';
import type { RelativePathString } from 'expo-router';

import { supabase } from '@/client/supabase';
import {
  getBloggers, fetchBloggerInfo, fetchAndSaveWorks,
  formatCount, formatDate, formatDuration,
  getWorksMetricsDelta,
} from '@/lib/api';
import type { Work, Blogger, WorkMetricsDelta } from '@/lib/types';

// 浅色面板配色
const C = {
  bg: '#F5F7FA',
  card: '#FFFFFF',
  border: '#E4E8EF',
  text: '#1A1D23',
  sub: '#6B7280',
  primary: '#2563EB',
  primaryBg: '#EFF6FF',
  success: '#16A34A',
  successBg: '#F0FDF4',
  accent: '#7C3AED',
  up: '#EF4444',   // 涨=红（中国股市惯例）
  down: '#22C55E', // 跌=绿
  flat: '#9CA3AF',
};

export default function MonitorScreen() {
  const [works, setWorks] = useState<Work[]>([]);
  const [bloggers, setBloggers] = useState<Blogger[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [refreshStatus, setRefreshStatus] = useState('');
  const [deltas, setDeltas] = useState<Record<string, WorkMetricsDelta>>({});
  const spinAnim = useRef(new Animated.Value(0)).current;

  const startOfDay = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
  };

  const loadTodayWorks = useCallback(async () => {
    try {
      const [worksRes, bloggersRes] = await Promise.all([
        supabase
          .from('works')
          .select('*, blogger:bloggers(*)')
          .gte('publish_time', startOfDay())
          .order('publish_time', { ascending: false })
          .limit(200),
        getBloggers(),
      ]);
      if (worksRes.error) throw worksRes.error;
      const list = (worksRes.data || []) as Work[];
      setWorks(list);
      setBloggers(bloggersRes);
      setTodayCount(list.length);

      // 加载作品数据变化
      if (list.length > 0) {
        const deltaMap = await getWorksMetricsDelta(list.map(w => w.id));
        setDeltas(deltaMap);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      loadTodayWorks();
    }, [loadTodayWorks]),
  );

  // 真实刷新：逐个博主重新抓取最新作品
  const handleRefresh = async () => {
    // 先确保 bloggers 数据是最新的
    const currentBloggers = bloggers.length > 0 ? bloggers : await getBloggers().catch(() => []);
    if (currentBloggers.length === 0) {
      Alert.alert('提示', '暂无关注的博主，请先在「博主」页面添加');
      return;
    }

    setRefreshing(true);
    setRefreshStatus('准备刷新...');
    let successCount = 0;
    let failCount = 0;
    try {
      // 启动旋转动画
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        { iterations: -1 }
      ).start();

      // 逐个博主刷新，显示进度
      for (let i = 0; i < currentBloggers.length; i++) {
        const blogger = currentBloggers[i];
        setRefreshStatus(`正在刷新 (${i + 1}/${currentBloggers.length}) ${blogger.nickname || ''}...`);
        try {
          const info = await fetchBloggerInfo(blogger.home_url);
          if (info.sec_uid) {
            await fetchAndSaveWorks(blogger.id, info.sec_uid);
            successCount++;
          }
        } catch {
          failCount++;
        }
      }
      // 重新加载数据
      setRefreshStatus('加载最新数据...');
      await loadTodayWorks();
      setLastRefresh(new Date());
      setRefreshStatus(`刷新完成 ✓ 成功 ${successCount}，失败 ${failCount}`);
      // 2 秒后清除状态文字
      setTimeout(() => setRefreshStatus(''), 2000);
    } finally {
      spinAnim.stopAnimation();
      setRefreshing(false);
    }
  };

  // 无博主提示
  if (!loading && bloggers.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg }}>
        <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border }}>
          <Text style={{ color: C.text, fontSize: 22, fontWeight: '700' }}>实时监控</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <Radio size={40} color="#CBD5E1" />
          <Text style={{ color: C.sub, fontSize: 15 }}>暂无关注的博主</Text>
          <Text style={{ color: C.sub, fontSize: 13 }}>请先在"博主"页面添加关注</Text>
        </View>
      </View>
    );
  }

  const renderWork = ({ item }: { item: Work }) => {
    const delta = deltas[item.id];
    return (
    <Pressable
      onPress={() => router.push(`/(app)/works/detail/${item.id}` as RelativePathString)}
      style={{ backgroundColor: C.card, marginHorizontal: 12, marginBottom: 10, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}
    >
      <View style={{ flexDirection: 'row' }}>
        {/* 封面 */}
        <View style={{ width: 100, height: 134, backgroundColor: '#F3F4F6' }}>
          {item.cover_url ? (
            <Image source={{ uri: item.cover_url }} style={{ width: 100, height: 134 }} contentFit="cover" />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: '#D1D5DB', fontSize: 11 }}>无封面</Text>
            </View>
          )}
        </View>
        {/* 信息 */}
        <View style={{ flex: 1, padding: 11, gap: 4 }}>
          {/* 博主名 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: C.primaryBg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
              <Text style={{ color: C.primary, fontSize: 11, fontWeight: '600' }}>{item.blogger?.nickname || '未知博主'}</Text>
            </View>
            {item.duration ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Clock size={10} color={C.sub} />
                <Text style={{ color: C.sub, fontSize: 11 }}>{formatDuration(item.duration)}</Text>
              </View>
            ) : null}
          </View>
          {/* 标题 */}
          <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', lineHeight: 18 }} numberOfLines={2}>
            {item.title || '暂无标题'}
          </Text>
          {/* 统计数据 + 变化 */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
            <DeltaBadge emoji="❤️" value={formatCount(item.like_count)} delta={delta?.like_delta} />
            <DeltaBadge emoji="💬" value={formatCount(item.comment_count)} delta={delta?.comment_delta} />
            <DeltaBadge emoji="🔄" value={formatCount(item.share_count)} delta={delta?.share_delta} />
            <DeltaBadge emoji="⭐" value={formatCount(item.collect_count)} delta={delta?.collect_delta} />
          </View>
          {/* 时间 */}
          <Text style={{ color: '#9CA3AF', fontSize: 10, marginTop: 1 }}>
            {formatDate(item.publish_time)}
          </Text>
        </View>
      </View>
    </Pressable>
    );
  };

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      {/* 头部 */}
      <View style={{ paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: C.card, borderBottomWidth: 1, borderBottomColor: C.border }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' }}>
              <Radio size={20} color={C.primary} />
            </View>
            <View>
              <Text style={{ color: C.text, fontSize: 20, fontWeight: '700' }}>实时监控</Text>
              <Text style={{ color: C.sub, fontSize: 12, marginTop: 1 }}>
                {lastRefresh.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 更新 · 今日 {todayCount} 条
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end', gap: 4 }}>
            <Pressable
              onPress={handleRefresh}
              disabled={refreshing}
              style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: refreshing ? C.primaryBg : C.primary, alignItems: 'center', justifyContent: 'center' }}
            >
              {refreshing ? (
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                  <RefreshCw size={18} color={C.primary} />
                </Animated.View>
              ) : (
                <RefreshCw size={18} color="#FFFFFF" />
              )}
            </Pressable>
            {refreshStatus ? (
              <Text style={{ color: refreshing ? C.primary : '#16A34A', fontSize: 11, fontWeight: '500', maxWidth: 160, textAlign: 'right' }}>
                {refreshStatus}
              </Text>
            ) : null}
          </View>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={works}
          keyExtractor={(item) => item.id}
          renderItem={renderWork}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 60, gap: 10 }}>
              <TrendingUp size={44} color="#CBD5E1" />
              <Text style={{ color: C.sub, fontSize: 15 }}>今日暂无新作品</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>点击右上角刷新按钮抓取最新数据</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function DeltaBadge({ emoji, value, delta }: { emoji: string; value: string; delta?: number }) {
  const hasDelta = delta !== undefined && delta !== 0;
  const deltaColor = !hasDelta ? C.flat : (delta > 0 ? C.up : C.down);
  const deltaText = !hasDelta ? '' : (delta! > 0 ? `+${formatCount(delta!)}` : formatCount(delta!));
  const DeltaIcon = !hasDelta ? null : (delta! > 0 ? ArrowUp : ArrowDown);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      <Text style={{ fontSize: 11 }}>{emoji}</Text>
      <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '600' }}>{value}</Text>
      {hasDelta && DeltaIcon && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0, marginLeft: 1 }}>
          <DeltaIcon size={9} color={deltaColor} />
          <Text style={{ color: deltaColor, fontSize: 9, fontWeight: '700' }}>{deltaText}</Text>
        </View>
      )}
    </View>
  );
}
