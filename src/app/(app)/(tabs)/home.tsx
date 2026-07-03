// 博主列表主页（首页）- 参考截图重排：分组胶囊 + 博主卡片
import { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Image } from 'expo-image';
import {
  Plus, RefreshCw, Trash2, Search, User, Settings2, Users, ChevronRight,
  ArrowUp, ArrowDown,
} from 'lucide-react-native';
import type { RelativePathString } from 'expo-router';

import {
  getBloggers,
  getCategories,
  fetchBloggerInfo,
  saveBlogger,
  deleteBlogger,
  fetchAndSaveWorks,
  formatCount,
  isToday,
} from '@/lib/api';
import {
  scheduleNewWorkNotification,
  scheduleDailyReport,
  requestNotificationPermission,
} from '@/lib/notifications';
import type { Blogger, Work, Category } from '@/lib/types';
import type { BloggerMetricsDelta } from '@/lib/types';
import { getBloggersMetricsDelta } from '@/lib/api';

export default function HomeScreen() {
  const [bloggers, setBloggers] = useState<Blogger[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [inputUrl, setInputUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [bloggerDeltas, setBloggerDeltas] = useState<Record<string, BloggerMetricsDelta>>({});
  const scrollRef = useRef<ScrollView>(null);
  const tabPositions = useRef<{ [key: string]: number }>({});

  // 根据选中的分类筛选博主
  const filteredBloggers = selectedCategoryId
    ? bloggers.filter((b) => b.categories?.some((c) => c.id === selectedCategoryId))
    : bloggers;

  const load = useCallback(async () => {
    try {
      const [data, cats] = await Promise.all([getBloggers(), getCategories()]);
      setBloggers(data);
      setCategories(cats);
      // 加载博主粉丝变化
      if (data.length > 0) {
        const deltaMap = await getBloggersMetricsDelta(data.map(b => b.id));
        setBloggerDeltas(deltaMap);
      }
    } catch (e) {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      load();
    }, [load]),
  );

  // 从混合文本（如分享消息）中提取抖音链接
  const extractUrl = (text: string): string | null => {
    const m = text.match(/https?:\/\/[^\s"'<>]*douyin\.com[^\s"'<>]*/);
    return m ? m[0].replace(/[）。，、\s]+$/, '') : null;
  };

  // 添加博主
  const handleAdd = async () => {
    const raw = inputUrl.trim();
    if (!raw) {
      setAddError('请输入抖音主页链接或分享文本');
      return;
    }
    const url = raw.includes('http') ? (extractUrl(raw) ?? raw) : raw;
    if (!url.includes('douyin.com')) {
      setAddError('未找到抖音链接，请粘贴含链接的分享文本');
      return;
    }
    setAdding(true);
    setAddError('');
    try {
      const info = await fetchBloggerInfo(url);
      const blogger = await saveBlogger({ ...info, home_url: url });
      if (info.sec_uid) {
        const works = await fetchAndSaveWorks(blogger.id, info.sec_uid);
        await requestNotificationPermission();
        const todayWorks = works.filter((w: Work) => isToday(w.publish_time));
        for (const w of todayWorks) {
          await scheduleNewWorkNotification(blogger, w);
        }
      }
      setInputUrl('');
      setModalVisible(false);
      load();
    } catch (e: unknown) {
      setAddError(e instanceof Error ? e.message : '获取失败，请检查链接');
    } finally {
      setAdding(false);
    }
  };

  // 刷新所有博主数据
  const handleRefreshAll = async () => {
    setRefreshing(true);
    try {
      await requestNotificationPermission();
      const allWorks: Work[] = [];
      for (const blogger of bloggers) {
        try {
          const info = await fetchBloggerInfo(blogger.home_url);
          if (info.sec_uid) {
            const works = await fetchAndSaveWorks(blogger.id, info.sec_uid);
            const todayWorks = works.filter((w: Work) => isToday(w.publish_time));
            for (const w of todayWorks) {
              await scheduleNewWorkNotification(blogger, w);
            }
            allWorks.push(...todayWorks);
          }
        } catch {
          // 单个博主失败不影响其他
        }
      }
      await load();
      if (allWorks.length > 0) {
        await scheduleDailyReport(bloggers, allWorks);
      }
    } finally {
      setRefreshing(false);
    }
  };

  // 删除博主
  const confirmDelete = (id: string) => setDeleteId(id);
  const handleDelete = async () => {
    if (!deleteId) return;
    await deleteBlogger(deleteId);
    setDeleteId(null);
    load();
  };

  // 计算每个分组下的博主数
  const getCategoryBloggerCount = (categoryId: string) =>
    bloggers.filter((b) => b.categories?.some((c) => c.id === categoryId)).length;

  // 选中 tab 时自动滚动到可视区域
  const handleTabPress = (id: string | null) => {
    setSelectedCategoryId(id);
  };

  const renderBlogger = ({ item }: { item: Blogger }) => {
    const delta = bloggerDeltas[item.id];
    const followerDelta = delta?.follower_delta || 0;
    const hasFollowerDelta = followerDelta !== 0;
    const followerDeltaColor = followerDelta > 0 ? '#EF4444' : '#22C55E';
    return (
    <Pressable
      onPress={() => router.push(`/(app)/works/${item.id}` as RelativePathString)}
      style={{
        backgroundColor: '#FFFFFF',
        marginHorizontal: 12,
        marginBottom: 8,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#E8ECF2',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12 }}>
        {/* 头像 */}
        <View style={{ width: 44, height: 44, borderRadius: 22, overflow: 'hidden', marginRight: 12, backgroundColor: '#F3F4F6' }}>
          {item.avatar_url ? (
            <Image source={{ uri: item.avatar_url }} style={{ width: 44, height: 44 }} />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EEF2FF' }}>
              <Text style={{ color: '#2563EB', fontSize: 17, fontWeight: '700' }}>
                {item.nickname.charAt(0)}
              </Text>
            </View>
          )}
        </View>

        {/* 名字 + 统计 */}
        <View style={{ flex: 1 }}>
          <Text style={{ color: '#1A1D23', fontWeight: '600', fontSize: 14 }} numberOfLines={1}>
            {item.nickname}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={{ fontSize: 11 }}>👥</Text>
              <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '500' }}>{formatCount(item.follower_count)}</Text>
              {hasFollowerDelta && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 0, marginLeft: 1 }}>
                  {followerDelta > 0 ? (
                    <ArrowUp size={9} color={followerDeltaColor} />
                  ) : (
                    <ArrowDown size={9} color={followerDeltaColor} />
                  )}
                  <Text style={{ color: followerDeltaColor, fontSize: 9, fontWeight: '700' }}>
                    {followerDelta > 0 ? '+' : ''}{formatCount(followerDelta)}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
              <Text style={{ fontSize: 11 }}>🎬</Text>
              <Text style={{ color: '#4B5563', fontSize: 11, fontWeight: '500' }}>{item.total_works}</Text>
              {delta && delta.total_works_delta !== 0 && (
                <Text style={{ color: delta.total_works_delta > 0 ? '#EF4444' : '#22C55E', fontSize: 9, fontWeight: '700', marginLeft: 1 }}>
                  {delta.total_works_delta > 0 ? '+' : ''}{delta.total_works_delta}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* 删除 */}
        <Pressable
          onPress={() => confirmDelete(item.id)}
          hitSlop={8}
          style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#FEF2F2', alignItems: 'center', justifyContent: 'center', marginLeft: 4 }}
        >
          <Trash2 size={13} color="#DC2626" />
        </Pressable>
      </View>
    </Pressable>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FA' }}>
      {/* ─── 头部：头像 + 标题 + 操作按钮 ─── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingTop: 54, paddingBottom: 10,
        backgroundColor: '#FFFFFF',
        borderBottomWidth: 1, borderBottomColor: '#E8ECF2',
      }}>
        {/* 左侧头像 */}
        <Pressable
          onPress={() => router.push('/(app)/settings' as RelativePathString)}
          style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}
        >
          <User size={18} color="#2563EB" />
        </Pressable>

        {/* 标题 */}
        <Text style={{ flex: 1, color: '#1A1D23', fontSize: 20, fontWeight: '700' }}>我的关注</Text>

        {/* 右侧操作 */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable
            onPress={handleRefreshAll}
            disabled={refreshing}
            style={{
              width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: '#E8ECF2',
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: refreshing ? '#EFF6FF' : '#FFFFFF',
            }}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#2563EB" />
            ) : (
              <RefreshCw size={16} color="#2563EB" />
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setInputUrl('');
              setAddError('');
              setModalVisible(true);
            }}
            style={{
              width: 34, height: 34, borderRadius: 17,
              backgroundColor: '#2563EB',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Plus size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      {/* ─── 正文 ─── */}
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={filteredBloggers}
          keyExtractor={(item) => item.id}
          renderItem={renderBlogger}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View>
              {/* ── 分组胶囊 tabs ── */}
              <View style={{ paddingVertical: 8, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E8ECF2' }}>
                <ScrollView
                  ref={scrollRef}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 12, gap: 8 }}
                >
                  {/* "全部" Tab */}
                  <Pressable
                    onPress={() => handleTabPress(null)}
                    style={{
                      paddingHorizontal: 16, paddingVertical: 7,
                      borderRadius: 20,
                      backgroundColor: selectedCategoryId === null ? '#2563EB' : '#F3F4F6',
                    }}
                  >
                    <Text style={{
                      fontSize: 13, fontWeight: '600',
                      color: selectedCategoryId === null ? '#FFFFFF' : '#4B5563',
                    }}>
                      全部 · {bloggers.length}
                    </Text>
                  </Pressable>

                  {/* 分类 Tabs */}
                  {categories.map((cat) => {
                    const count = getCategoryBloggerCount(cat.id);
                    const isActive = selectedCategoryId === cat.id;
                    return (
                      <Pressable
                        key={cat.id}
                        onPress={() => handleTabPress(cat.id)}
                        style={{
                          paddingHorizontal: 16, paddingVertical: 7,
                          borderRadius: 20,
                          backgroundColor: isActive ? '#2563EB' : '#F3F4F6',
                          flexDirection: 'row', alignItems: 'center', gap: 4,
                        }}
                      >
                        <Text style={{
                          fontSize: 13, fontWeight: '600',
                          color: isActive ? '#FFFFFF' : '#4B5563',
                        }}>
                          {cat.name}
                        </Text>
                        <View style={{
                          minWidth: 18, height: 18, borderRadius: 9,
                          backgroundColor: isActive ? 'rgba(255,255,255,0.25)' : '#E5E7EB',
                          alignItems: 'center', justifyContent: 'center',
                          paddingHorizontal: 5,
                        }}>
                          <Text style={{
                            fontSize: 10, fontWeight: '700',
                            color: isActive ? '#FFFFFF' : '#6B7280',
                          }}>
                            {count}
                          </Text>
                        </View>
                      </Pressable>
                    );
                  })}

                  {/* 管理按钮 */}
                  <Pressable
                    onPress={() => router.push('/(app)/categories' as RelativePathString)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 7,
                      borderRadius: 20, borderWidth: 1, borderColor: '#E5E7EB',
                      flexDirection: 'row', alignItems: 'center', gap: 3,
                      backgroundColor: '#FFFFFF',
                    }}
                  >
                    <Settings2 size={13} color="#6B7280" />
                    <Text style={{ fontSize: 12, color: '#6B7280', fontWeight: '500' }}>管理</Text>
                  </Pressable>
                </ScrollView>
              </View>

              {/* ── 分类标题栏 ── */}
              {selectedCategoryId && filteredBloggers.length > 0 ? (
                <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 }}>
                    {categories.find((c) => c.id === selectedCategoryId)?.name} · {filteredBloggers.length} 人
                  </Text>
                </View>
              ) : !selectedCategoryId && filteredBloggers.length > 0 ? (
                <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                  <Text style={{ color: '#6B7280', fontSize: 12, fontWeight: '600', letterSpacing: 0.3 }}>
                    全部博主 · {filteredBloggers.length} 人
                  </Text>
                </View>
              ) : null}
            </View>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: 80, gap: 12 }}>
              <Users size={48} color="#D1D5DB" />
              <Text style={{ color: '#6B7280', fontSize: 15 }}>
                {selectedCategoryId ? '该分组暂无博主' : '暂无博主'}
              </Text>
              <Text style={{ color: '#9CA3AF', fontSize: 13 }}>点击右上角 + 添加博主</Text>
              {!selectedCategoryId && (
                <Pressable
                  onPress={() => setModalVisible(true)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 6,
                    backgroundColor: '#2563EB', paddingHorizontal: 20, paddingVertical: 10,
                    borderRadius: 20, marginTop: 8,
                  }}
                >
                  <Plus size={16} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>添加博主</Text>
                </Pressable>
              )}
            </View>
          }
        />
      )}

      {/* 添加博主弹窗 */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
            <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, width: '100%', maxWidth: 360, padding: 20, gap: 14 }}>
              <Text style={{ color: '#1A1D23', fontSize: 17, fontWeight: '700' }}>添加抖音博主</Text>
              <Text style={{ color: '#6B7280', fontSize: 13, lineHeight: 20 }}>
                输入博主抖音主页链接，例如：{'\n'}https://www.douyin.com/user/xxxxx
              </Text>
              <TextInput
                value={inputUrl}
                onChangeText={(t) => {
                  setInputUrl(t);
                  setAddError('');
                }}
                placeholder="粘贴主页链接或分享文本"
                placeholderTextColor="#9CA3AF"
                style={{ backgroundColor: '#F5F7FA', borderWidth: 1, borderColor: '#E4E8EF', borderRadius: 8, color: '#1A1D23', paddingHorizontal: 12, paddingVertical: 11, fontSize: 14 }}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {addError ? (
                <Text style={{ color: '#DC2626', fontSize: 13 }}>{addError}</Text>
              ) : null}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  style={{ flex: 1, borderWidth: 1, borderColor: '#E4E8EF', borderRadius: 10, paddingVertical: 12, alignItems: 'center' }}
                  onPress={() => setModalVisible(false)}
                  disabled={adding}
                >
                  <Text style={{ color: '#6B7280', fontWeight: '500', fontSize: 14 }}>取消</Text>
                </Pressable>
                <Pressable
                  style={{ flex: 1, backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12, alignItems: 'center', opacity: adding ? 0.6 : 1 }}
                  onPress={handleAdd}
                  disabled={adding}
                >
                  {adding ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>确定</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 删除确认弹窗 */}
      <Modal visible={!!deleteId} transparent animationType="fade">
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, width: '100%', maxWidth: 340, padding: 20, gap: 16 }}>
            <Text style={{ color: '#1A1D23', fontSize: 16, fontWeight: '700' }}>确认删除</Text>
            <Text style={{ color: '#6B7280', fontSize: 14, lineHeight: 20 }}>
              将删除该博主及所有相关数据，此操作不可撤销。
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Pressable
                style={{ flex: 1, borderWidth: 1, borderColor: '#E4E8EF', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                onPress={() => setDeleteId(null)}
              >
                <Text style={{ color: '#6B7280', fontWeight: '500', fontSize: 14 }}>取消</Text>
              </Pressable>
              <Pressable
                style={{ flex: 1, backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 11, alignItems: 'center' }}
                onPress={handleDelete}
              >
                <Text style={{ color: '#FFFFFF', fontWeight: '600', fontSize: 14 }}>删除</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
