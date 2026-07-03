// 类型定义
export interface Blogger {
  id: string;
  douyin_user_id: string;
  nickname: string;
  avatar_url: string | null;
  bio: string;
  follower_count: number;
  total_works: number;
  home_url: string;
  created_at: string;
  updated_at: string;
  categories?: Category[];
}

export interface Category {
  id: string;
  name: string;
  created_at: string;
  bloggers?: Blogger[];
}

export interface Work {
  id: string;
  blogger_id: string;
  douyin_aweme_id: string;
  title: string;
  cover_url: string | null;
  video_url: string | null;
  play_url?: string | null;
  subtitle_url: string | null;
  publish_time: string | null;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
  duration: number;
  created_at: string;
  updated_at: string;
  blogger?: Blogger;
  transcript?: Transcript;
}

export interface Transcript {
  id: string;
  work_id: string;
  content: string;
  word_count: number;
  created_at: string;
}

export interface AiAnalysis {
  id: string;
  work_id: string;
  content: AiAnalysisContent;
  created_at: string;
}

export interface AiAnalysisContent {
  title_analysis: string;
  opening_hook: string;
  story_outline: string;
  emotional_rhythm: string;
  language_dna: string;
  cta_strategy: string;
  tag_strategy: string;
  writing_style_prompt: string;
  highlights: string;
  improvements: string;
  target_audience: string;
  topic_breakdown: string;
  copy_structure: string;
  viral_factors: string;
  writing_techniques: string;
  narrative_style: string;
  content_features: string;
  ending_technique: string;
  raw?: string;
}

export const AI_ANALYSIS_LABELS: { key: keyof AiAnalysisContent; label: string }[] = [
  { key: 'title_analysis', label: '标题分析' },
  { key: 'opening_hook', label: '开头钩子类型' },
  { key: 'story_outline', label: '中间故事线' },
  { key: 'emotional_rhythm', label: '情感节奏' },
  { key: 'language_dna', label: '语言DNA' },
  { key: 'cta_strategy', label: 'CTA策略' },
  { key: 'tag_strategy', label: '标签策略' },
  { key: 'writing_style_prompt', label: '文风基因提示词' },
  { key: 'highlights', label: '可借鉴之处' },
  { key: 'improvements', label: '需要修改之处' },
  { key: 'target_audience', label: '受众人群' },
  { key: 'topic_breakdown', label: '选题拆解' },
  { key: 'copy_structure', label: '文案结构拆解' },
  { key: 'viral_factors', label: '爆点因素' },
  { key: 'writing_techniques', label: '写作技巧' },
  { key: 'narrative_style', label: '叙事特点' },
  { key: 'content_features', label: '内容特征' },
  { key: 'ending_technique', label: '结尾技法' },
];

export interface TopComment {
  id: string;
  work_id: string;
  commenter_nickname: string;
  commenter_avatar_url: string | null;
  content: string;
  like_count: number;
  reply_count: number;
}

export interface AiProvider {
  id: string;
  name: string;
  api_key: string;
  api_endpoint: string;
  selected_model: string;
  available_models: { id: string; name: string }[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface WritingTemplate {
  id: string;
  name: string;
  content: string;
  sort_order: number;
  created_at: string;
}

export interface AiConfig {
  id: string;
  api_key: string;
  api_endpoint: string;
  selected_model: string;
  available_models: { id: string; name: string }[];
}

// ─── 数据变化监控类型 ───────────────────────────────────────────
export interface WorkMetricsDelta {
  like_delta: number;
  comment_delta: number;
  share_delta: number;
  collect_delta: number;
  prev_snapshot_at: string | null;
}

export interface BloggerMetricsDelta {
  follower_delta: number;
  total_works_delta: number;
  prev_snapshot_at: string | null;
}

export interface WorkSnapshot {
  snapshot_at: string;
  like_count: number;
  comment_count: number;
  share_count: number;
  collect_count: number;
}

export interface BloggerSnapshot {
  snapshot_at: string;
  follower_count: number;
  total_works: number;
}
