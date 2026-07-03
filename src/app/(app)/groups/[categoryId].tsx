// 分组详情页：展示该分组下的博主，点击博主进入其作品列表
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
import { ArrowLeft, ChevronRight, Users, Folder } from 'lucide-react-native';
import type { RelativePathString } from 'expo-router';

import { getBloggers, formatCount } from '@/lib/api';
import type { Blogger, Category } from '@/lib/types';

export default function GroupDetailScreen() {
  const { categoryId } = useLocalSearchParams<{ categoryId: string }>();
  const [category, setCategory] = useState<Category | null>(null);
  const [bloggers, setBloggers] = useState<Blogger[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const all = await getBloggers();
      const inGroup = all.filter((b) =>
        b.categories?.some((c) => c.id === categoryId)
      );
      setBloggers(inGroup);
      // 从第一个博主的分组信息里拿到分类名称
      const found = inGroup.find((b) =>
        b.categories?.some((c) => c.id === categoryId)
      );
      setCategory(found?.categories?.find((c) => c.id === categoryId) || null);
    } finally {
      setLoading(false);
    }
  }, [categoryId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const renderBlogger = ({ item }: { item: Blogger }) => (
    <Pressable
      className="flex-row items-center px-4 py-3 bg-card border-b border-border active:opacity-70"
      onPress={() => router.push(`/(app)/works/${item.id}` as RelativePathString)}
    >
      <View className="w-12 h-12 rounded-full overflow-hidden mr-3 bg-muted">
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={{ width: 48, height: 48 }} />
        ) : (
          <View className="w-12 h-12 rounded-full bg-muted items-center justify-center">
            <Text className="text-lg text-muted-foreground">{item.nickname.charAt(0)}</Text>
          </View>
        )}
      </View>
      <View className="flex-1 min-w-0">
        <Text className="text-foreground font-semibold text-base" numberOfLines={1}>
          {item.nickname}
        </Text>
        <View className="flex-row gap-4 mt-0.5">
          <Text className="text-muted-foreground text-xs">粉丝 {formatCount(item.follower_count)}</Text>
          <Text className="text-muted-foreground text-xs">作品 {item.total_works}</Text>
        </View>
      </View>
      <ChevronRight size={16} color="#444" />
    </Pressable>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: '#F5F7FA' }}>
      {/* 头部 */}
      <View style={{ backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E4E8EF', paddingTop: 50, paddingBottom: 12, paddingHorizontal: 16 }}>
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="p-1 active:opacity-60">
            <ArrowLeft size={22} color="#1A1D23" />
          </Pressable>
          <View className="flex-row items-center gap-2 flex-1">
            <Folder size={20} color="#2563EB" />
            <Text style={{ color: '#1A1D23', fontSize: 18, fontWeight: '700' }} numberOfLines={1}>
              {category?.name || '分组详情'}
            </Text>
          </View>
        </View>
        <View className="flex-row items-center gap-2 mt-2 ml-10">
          <Users size={14} color="#9CA3AF" />
          <Text style={{ color: '#6B7280', fontSize: 12 }}>共 {bloggers.length} 位博主</Text>
        </View>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={bloggers}
          keyExtractor={(item) => item.id}
          renderItem={renderBlogger}
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center mt-24 gap-3">
              <Text className="text-muted-foreground text-base">该分组暂无博主</Text>
              <Text className="text-muted-foreground text-sm">去"分组管理"中添加博主</Text>
            </View>
          }
        />
      )}
    </View>
  );
}
