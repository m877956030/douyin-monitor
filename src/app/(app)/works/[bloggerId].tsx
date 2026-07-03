// 作品列表页
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { ArrowLeft, RefreshCw, Clock, TrendingUp, ArrowUp, ArrowDown } from 'lucide-react-native';
import type { RelativePathString } from 'expo-router';

import { getWorks, fetchAndSaveWorks, fetchBloggerInfo, formatCount, isToday, formatDate, formatDuration, getWorksMetricsDelta, getBloggerMetricsDelta } from '@/lib/api';
import { supabase } from '@/client/supabase';
import type { Work, Blogger, WorkMetricsDelta, BloggerMetricsDelta } from '@/lib/types';

export default function WorksScreen() {
  const { bloggerId } = useLocalSearchParams<{ bloggerId: string }>();
  const [blogger, setBlogger] = useState<Blogger | null>(null);
  const [works, setWorks] = useState<Work[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deltas, setDeltas] = useState<Record<string, WorkMetricsDelta>>({});
  const [bloggerDelta, setBloggerDelta] = useState<BloggerMetricsDelta | null>(null);

  const loadData = useCallback(async (id: string) => {
    try {
      const [{ data: b }, ws] = await Promise.all([
        supabase.from('bloggers').select('*').eq('id', id).single(),
        getWorks(id),
      ]);
      if (b) setBlogger(b);
      setWorks(ws);

      // 加载每条作品的数据变化（与上一次刷新对比）
      if (ws.length > 0) {
        const deltaMap = await getWorksMetricsDelta(ws.map(w => w.id));
        setDeltas(deltaMap);
      }
      // 加载博主粉丝变化
      const bDelta = await getBloggerMetricsDelta(id);
      setBloggerDelta(bDelta);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (bloggerId) {
        setLoading(true);
        loadData(bloggerId);
      }
    }, [bloggerId, loadData]),
  );

  const handleRefresh = async () => {
    if (!blogger || !bloggerId) return;
    setRefreshing(true);
    try {
      const info = await fetchBloggerInfo(blogger.home_url);
      if (info.sec_uid) {
        const ws = await fetchAndSaveWorks(bloggerId, info.sec_uid);
        setWorks(ws);
        // 刷新后重新加载变化数据
        if (ws.length > 0) {
          const deltaMap = await getWorksMetricsDelta(ws.map(w => w.id));
          setDeltas(deltaMap);
        }
        const bDelta = await getBloggerMetricsDelta(bloggerId);
        setBloggerDelta(bDelta);
        // 刷新博主信息
        const { data: updatedBlogger } = await supabase.from('bloggers').select('*').eq('id', bloggerId).single();
        if (updatedBlogger) setBlogger(updatedBlogger);
      }
    } finally {
      setRefreshing(false);
    }
  };

  const renderWork = ({ item }: { item: Work }) => {
    const today = isToday(item.publish_time);
    const delta = deltas[item.id];
    return (
      <Pressable
        onPress={() => router.push(`/(app)/works/detail/${item.id}` as RelativePathString)}
        style={{
          backgroundColor: '#FFFFFF',
          marginHorizontal: 12,
          marginBottom: 10,
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: '#E4E8EF',
        }}
      >
        <View style={{ flexDirection: 'row' }}>
          {/* 封面 */}
          <View style={{ width: 100, height: 130, backgroundColor: '#F3F4F6' }}>
            {item.cover_url ? (
              <Image
                source={{ uri: item.cover_url }}
                style={{ width: 100, height: 130 }}
                contentFit="cover"
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: '#D1D5DB', fontSize: 11 }}>无封面</Text>
              </View>
            )}
            {/* 时长标签 */}
            {item.duration ? (
              <View style={{
                position: 'absolute', bottom: 4, right: 4,
                backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 4,
                paddingHorizontal: 5, paddingVertical: 2,
              }}>
                <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '600' }}>
                  {formatDuration(item.duration)}
                </Text>
              </View>
            ) : null}
          </View>

          {/* 信息区域 */}
          <View style={{ flex: 1, padding: 10, gap: 4 }}>
            {/* 今日标记 */}
            {today && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                <View style={{ backgroundColor: '#EFF6FF', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                  <Text style={{ color: '#2563EB', fontSize: 11, fontWeight: '600' }}>今日发布</Text>
                </View>
              </View>
            )}

            {/* 标题 */}
            <Text style={{ color: '#1A1D23', fontSize: 13, fontWeight: '600', lineHeight: 18 }} numberOfLines={2}>
              {item.title || '暂无标题'}
            </Text>

            {/* 时间 */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Clock size={11} color="#9CA3AF" />
              <Text style={{ color: '#9CA3AF', fontSize: 11 }}>{formatDate(item.publish_time)}</Text>
            </View>

            {/* 数据统计 + 变化量 */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 2, flexWrap: 'wrap' }}>
              <DeltaBadge emoji="❤️" value={formatCount(item.like_count)} delta={delta?.like_delta} />
              <DeltaBadge emoji="💬" value={formatCount(item.comment_count)} delta={delta?.comment_delta} />
              <DeltaBadge emoji="🔄" value={formatCount(item.share_count)} delta={delta?.share_delta} />
              <DeltaBadge emoji="⭐" value={formatCount(item.collect_count)} delta={delta?.collect_delta} />
            </View>
          </View>
        </View>
      </Pressable>
    );
  };

  const followerDelta = bloggerDelta?.follower_delta || 0;
  const hasFollowerDelta = followerDelta !== 0;
  const followerDeltaColor = followerDelta > 0 ? '#EF4444' : '#22C55E';

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      {/* 头部 */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E4E8EF', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Pressable onPress={() => router.back()} style={{ padding: 4, marginRight: 8 }}>
            <ArrowLeft size={22} color="#1A1D23" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ color: '#1A1D23', fontSize: 18, fontWeight: '700' }} numberOfLines={1}>
                {blogger?.nickname || '作品列表'}
              </Text>
            </View>
            {blogger && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                  <Text style={{ color: '#6B7280', fontSize: 12 }}>👥 {formatCount(blogger.follower_count)}</Text>
                  {hasFollowerDelta && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0, marginLeft: 1 }}>
                      {followerDelta > 0 ? (
                        <ArrowUp size={9} color={followerDeltaColor} />
                      ) : (
                        <ArrowDown size={9} color={followerDeltaColor} />
                      )}
                      <Text style={{ color: followerDeltaColor, fontSize: 10, fontWeight: '700' }}>
                        {followerDelta > 0 ? '+' : ''}{formatCount(followerDelta)}
                      </Text>
                    </View>
                  )}
                </View>
                <Text style={{ color: '#6B7280', fontSize: 12 }}>· 🎬 {blogger.total_works}</Text>
                {bloggerDelta && bloggerDelta.total_works_delta !== 0 && (
                  <Text style={{ color: bloggerDelta.total_works_delta > 0 ? '#EF4444' : '#22C55E', fontSize: 10, fontWeight: '700' }}>
                    {bloggerDelta.total_works_delta > 0 ? '+' : ''}{bloggerDelta.total_works_delta}
                  </Text>
                )}
              </View>
            )}
          </View>
          <Pressable
            onPress={handleRefresh}
            disabled={refreshing}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: refreshing ? '#EFF6FF' : '#2563EB', alignItems: 'center', justifyContent: 'center' }}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <RefreshCw size={18} color="#FFFFFF" />
            )}
          </Pressable>
        </View>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={works}
          keyExtractor={(item) => item.id}
          renderItem={renderWork}
          contentContainerStyle={{ paddingTop: 14, paddingBottom: 20 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            works.length > 0 ? (
              <View style={{ paddingHorizontal: 16, paddingBottom: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <TrendingUp size={14} color="#6B7280" />
                  <Text style={{ color: '#6B7280', fontSize: 12 }}>
                    共 {works.length} 条作品
                  </Text>
                  {bloggerDelta?.prev_snapshot_at && (
                    <Text style={{ color: '#9CA3AF', fontSize: 11 }}>
                      · 变化对比 {formatDate(bloggerDelta.prev_snapshot_at)}
                    </Text>
                  )}
                </View>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', marginTop: 60, gap: 10 }}>
              <TrendingUp size={44} color="#CBD5E1" />
              <Text style={{ color: '#6B7280', fontSize: 15 }}>暂无作品数据</Text>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>点击右上角刷新获取最新作品</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function DeltaBadge({ emoji, value, delta }: { emoji: string; value: string; delta?: number }) {
  const hasDelta = delta !== undefined && delta !== 0;
  const deltaColor = !hasDelta ? '#9CA3AF' : (delta! > 0 ? '#EF4444' : '#22C55E');
  const DeltaIcon = !hasDelta ? null : (delta! > 0 ? ArrowUp : ArrowDown);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 1 }}>
      <Text style={{ fontSize: 11 }}>{emoji}</Text>
      <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '600' }}>{value}</Text>
      {hasDelta && DeltaIcon && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0, marginLeft: 1 }}>
          <DeltaIcon size={9} color={deltaColor} />
          <Text style={{ color: deltaColor, fontSize: 9, fontWeight: '700' }}>
            {delta! > 0 ? '+' : ''}{formatCount(delta!)}
          </Text>
        </View>
      )}
    </View>
  );
}
