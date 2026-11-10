import type { Document, Post } from '../db/schema';

/** 文章類單元：網址區段 ↔ 資料表 type */
export const POST_SECTIONS = {
  news: { type: 'news', label: '最新消息', eyebrow: 'News' },
  announcements: { type: 'announcement', label: '活動公告', eyebrow: 'Events' },
  interviews: { type: 'interview', label: '系友訪談', eyebrow: 'Interviews' },
} as const satisfies Record<string, { type: Post['type']; label: string; eyebrow: string }>;

export type PostSection = keyof typeof POST_SECTIONS;

export const isPostSection = (s: string | undefined): s is PostSection => !!s && s in POST_SECTIONS;

export const sectionOfType = (type: Post['type']) =>
  (Object.keys(POST_SECTIONS) as PostSection[]).find((k) => POST_SECTIONS[k].type === type)!;

export const POST_TYPES = Object.values(POST_SECTIONS).map((s) => s.type);

export const isPostType = (t: unknown): t is Post['type'] => POST_TYPES.includes(t as Post['type']);

/**
 * 後台管理空間（/admin/<key>）：同一個列表與編輯器可管理多個文章單元，
 * 文章可在同組單元間切換發布位置。sections 的第一項為新增文章的預設單元。
 */
export const POST_ADMIN_GROUPS = {
  announcements: { label: '公告與消息', sections: ['announcements', 'news'] },
  interviews: { label: '系友訪談', sections: ['interviews'] },
} as const satisfies Record<string, { label: string; sections: readonly PostSection[] }>;

export type PostAdminGroup = keyof typeof POST_ADMIN_GROUPS;

export const isPostAdminGroup = (g: string | undefined): g is PostAdminGroup => !!g && g in POST_ADMIN_GROUPS;

/** 管理空間內可選的單元（給篩選與編輯器下拉選單使用） */
export const groupOptions = (group: PostAdminGroup) =>
  POST_ADMIN_GROUPS[group].sections.map((section) => ({ section, ...POST_SECTIONS[section] }));

/** PDF 類單元 */
export const DOC_SECTIONS = {
  lectures: { type: 'lecture', label: '系友演講', eyebrow: 'Lectures' },
  resources: { type: 'resource', label: '相關資料', eyebrow: 'Resources' },
} as const satisfies Record<string, { type: Document['type']; label: string; eyebrow: string }>;

export type DocSection = keyof typeof DOC_SECTIONS;
