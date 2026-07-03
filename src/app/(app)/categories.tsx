// 分组管理页（从首页进入，不再作为底部 Tab）
import { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  Pressable,
  TextInput,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { Plus, Edit2, Trash2, Users, Check, X, ArrowLeft } from 'lucide-react-native';

import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getBloggers,
  assignBloggerCategory,
  removeBloggerCategory,
} from '@/lib/api';
import type { Category, Blogger } from '@/lib/types';

export default function CategoriesScreen() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [bloggers, setBloggers] = useState<Blogger[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModal, setAddModal] = useState(false);
  const [editModal, setEditModal] = useState<Category | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Category | null>(null);
  const [manageBloggers, setManageBloggers] = useState<Category | null>(null);
  const [inputName, setInputName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cats, bls] = await Promise.all([getCategories(), getBloggers()]);
      setCategories(cats);
      setBloggers(bls);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const handleCreate = async () => {
    if (!inputName.trim()) { setError('请输入分组名称'); return; }
    setSaving(true);
    try {
      await createCategory(inputName.trim());
      setAddModal(false);
      setInputName('');
      load();
    } catch { setError('创建失败，请重试'); }
    finally { setSaving(false); }
  };

  const handleEdit = async () => {
    if (!editModal || !inputName.trim()) { setError('请输入分组名称'); return; }
    setSaving(true);
    try {
      await updateCategory(editModal.id, inputName.trim());
      setEditModal(null);
      setInputName('');
      load();
    } catch { setError('更新失败，请重试'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteCategory(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  const toggleBloggerInCategory = async (blogger: Blogger, categoryId: string) => {
    const inCat = blogger.categories?.some((c) => c.id === categoryId);
    if (inCat) {
      await removeBloggerCategory(blogger.id, categoryId);
    } else {
      await assignBloggerCategory(blogger.id, categoryId);
    }
    load();
  };

  // 计算每个分组下的博主数
  const getBloggerCountForCategory = (categoryId: string) =>
    bloggers.filter((b) => b.categories?.some((c) => c.id === categoryId)).length;

  const renderCategory = ({ item }: { item: Category }) => (
    <View className="bg-card border-b border-border px-4 py-3 flex-row items-center">
      <View className="flex-1">
        <Text className="text-foreground font-medium text-base">{item.name}</Text>
        <Text className="text-muted-foreground text-xs mt-0.5">
          {getBloggerCountForCategory(item.id)} 位博主
        </Text>
      </View>
      <View className="flex-row gap-3 items-center">
        <Pressable
          className="p-1.5 active:opacity-60"
          onPress={() => { setManageBloggers(item); }}
        >
          <Users size={18} color="#2563EB" />
        </Pressable>
        <Pressable
          className="p-1.5 active:opacity-60"
          onPress={() => { setEditModal(item); setInputName(item.name); setError(''); }}
        >
          <Edit2 size={16} color="#9CA3AF" />
        </Pressable>
        <Pressable
          className="p-1.5 active:opacity-60"
          onPress={() => setDeleteTarget(item)}
        >
          <Trash2 size={16} color="#9CA3AF" />
        </Pressable>
      </View>
    </View>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: '#F5F7FA' }}>
      {/* 头部 */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E4E8EF' }}>
        <View className="flex-row items-center gap-3">
          <Pressable onPress={() => router.back()} className="p-1 active:opacity-60">
            <ArrowLeft size={22} color="#1A1D23" />
          </Pressable>
          <Text style={{ color: '#1A1D23', fontSize: 22, fontWeight: '700' }}>分组管理</Text>
        </View>
        <Pressable
          style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
          onPress={() => { setInputName(''); setError(''); setAddModal(true); }}
        >
          <Plus size={16} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '600' }}>新建分组</Text>
        </Pressable>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#2563EB" />
        </View>
      ) : (
        <FlatList
          data={categories}
          keyExtractor={(item) => item.id}
          renderItem={renderCategory}
          contentInsetAdjustmentBehavior="automatic"
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center mt-24 gap-3">
              <Text className="text-muted-foreground text-base">暂无分组</Text>
              <Text className="text-muted-foreground text-sm">点击"新建分组"创建第一个分组</Text>
            </View>
          }
        />
      )}

      {/* 新建分组弹窗 */}
      <Modal visible={addModal} transparent animationType="fade">
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="bg-card rounded-lg w-full p-5 gap-4">
            <Text className="text-foreground text-lg font-bold">新建分组</Text>
            <TextInput
              value={inputName}
              onChangeText={(t) => { setInputName(t); setError(''); }}
              placeholder="输入分组名称..."
              placeholderTextColor="#666"
              className="bg-input border border-border rounded text-foreground px-3 py-3 text-sm"
            />
            {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 border border-border rounded py-3 items-center active:opacity-70"
                onPress={() => setAddModal(false)}
              >
                <Text className="text-muted-foreground font-medium">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 bg-primary rounded py-3 items-center active:opacity-70"
                onPress={handleCreate}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#121212" /> : (
                  <Text className="text-primary-foreground font-semibold">创建</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 编辑分组弹窗 */}
      <Modal visible={!!editModal} transparent animationType="fade">
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="bg-card rounded-lg w-full p-5 gap-4">
            <Text className="text-foreground text-lg font-bold">编辑分组</Text>
            <TextInput
              value={inputName}
              onChangeText={(t) => { setInputName(t); setError(''); }}
              placeholder="输入分组名称..."
              placeholderTextColor="#666"
              className="bg-input border border-border rounded text-foreground px-3 py-3 text-sm"
            />
            {error ? <Text className="text-destructive text-sm">{error}</Text> : null}
            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 border border-border rounded py-3 items-center active:opacity-70"
                onPress={() => setEditModal(null)}
              >
                <Text className="text-muted-foreground font-medium">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 bg-primary rounded py-3 items-center active:opacity-70"
                onPress={handleEdit}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="#121212" /> : (
                  <Text className="text-primary-foreground font-semibold">保存</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 删除确认 */}
      <Modal visible={!!deleteTarget} transparent animationType="fade">
        <View className="flex-1 bg-black/70 items-center justify-center px-6">
          <View className="bg-card rounded-lg w-full p-5 gap-4">
            <Text className="text-foreground text-base font-bold">删除分组</Text>
            <Text className="text-muted-foreground text-sm">
              确认删除分组"{deleteTarget?.name}"？博主不会被删除，仅取消关联。
            </Text>
            <View className="flex-row gap-3">
              <Pressable
                className="flex-1 border border-border rounded py-3 items-center active:opacity-70"
                onPress={() => setDeleteTarget(null)}
              >
                <Text className="text-muted-foreground font-medium">取消</Text>
              </Pressable>
              <Pressable
                className="flex-1 bg-destructive rounded py-3 items-center active:opacity-70"
                onPress={handleDelete}
              >
                <Text className="text-destructive-foreground font-semibold">删除</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* 管理博主归属弹窗 */}
      <Modal visible={!!manageBloggers} transparent animationType="slide">
        <View className="flex-1 bg-black/70 justify-end">
          <View className="bg-card rounded-t-2xl" style={{ maxHeight: '80%' }}>
            <View className="flex-row items-center justify-between px-4 py-4 border-b border-border">
              <Text className="text-foreground text-lg font-bold">
                选择博主 — {manageBloggers?.name}
              </Text>
              <Pressable onPress={() => setManageBloggers(null)} className="p-1 active:opacity-60">
                <X size={20} color="#888" />
              </Pressable>
            </View>
            <FlatList
              data={bloggers}
              keyExtractor={(b) => b.id}
              contentContainerStyle={{ paddingBottom: 32 }}
              renderItem={({ item: blogger }) => {
                const isIn = blogger.categories?.some((c) => c.id === manageBloggers?.id);
                return (
                  <Pressable
                    className="flex-row items-center px-4 py-3 border-b border-border active:opacity-70"
                    onPress={() => manageBloggers && toggleBloggerInCategory(blogger, manageBloggers.id)}
                  >
                    <Text className="flex-1 text-foreground">{blogger.nickname}</Text>
                    {isIn && <Check size={18} color="#2563EB" />}
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}
