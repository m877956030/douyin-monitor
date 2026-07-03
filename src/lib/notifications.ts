// 通知工具函数
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Blogger, Work } from './types';

// 配置通知处理器
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync();
  return status === 'granted';
}

export async function scheduleNewWorkNotification(blogger: Blogger, work: Work) {
  if (Platform.OS === 'web') return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: `${blogger.nickname} 发布了新内容`,
      body: work.title || '点击查看作品详情',
      data: { bloggerId: blogger.id, workId: work.id },
    },
    trigger: null, // 立即发送
  });
}

export async function scheduleDailyReport(bloggers: Blogger[], todayWorks: Work[]) {
  if (Platform.OS === 'web') return;
  const count = todayWorks.length;
  if (count === 0) return;

  const bloggerNames = [...new Set(todayWorks.map((w) => {
    const b = bloggers.find((bl) => bl.id === w.blogger_id);
    return b?.nickname || '未知博主';
  }))].slice(0, 3).join('、');

  await Notifications.scheduleNotificationAsync({
    content: {
      title: '今日内容日报',
      body: `今天共 ${count} 条新内容，来自：${bloggerNames}${bloggers.length > 3 ? ' 等' : ''}`,
      data: { type: 'daily_report' },
    },
    trigger: null,
  });
}
