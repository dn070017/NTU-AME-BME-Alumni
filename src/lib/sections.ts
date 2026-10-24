import type { Document, Post } from '../db/schema';

/** 文章類單元：網址區段 ↔ 資料表 type */
export const POST_SECTIONS = {
  announcements: { type: 'announcement', label: '活動公告', eyebrow: 'News' },
  interviews: { type: 'interview', label: '系友訪談', eyebrow: 'Interviews' },
} as const satisfies Record<string, { type: Post['type']; label: string; eyebrow: string }>;

export type PostSection = keyof typeof POST_SECTIONS;

export const isPostSection = (s: string | undefined): s is PostSection => !!s && s in POST_SECTIONS;

export const sectionOfType = (type: Post['type']) =>
  (Object.keys(POST_SECTIONS) as PostSection[]).find((k) => POST_SECTIONS[k].type === type)!;

/** PDF 類單元 */
export const DOC_SECTIONS = {
  lectures: { type: 'lecture', label: '系友演講', eyebrow: 'Lectures' },
  resources: { type: 'resource', label: '相關資料', eyebrow: 'Resources' },
} as const satisfies Record<string, { type: Document['type']; label: string; eyebrow: string }>;

export type DocSection = keyof typeof DOC_SECTIONS;
