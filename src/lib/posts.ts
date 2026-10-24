import { env } from 'cloudflare:workers';
import type { Post } from '../db/schema';
import { badRequest, isDateString } from './api';
import { parseTaipeiDate } from './format';
import { excerptOf, mediaKeysIn, sanitizeHtml } from './sanitize';

export type PostInput = {
  type: Post['type'];
  title: string;
  contentHtml: string;
  coverKey: string | null;
  published: boolean;
  publishedAt: Date;
  excerpt: string | null;
};

/** 驗證並整理編輯器送來的資料；失敗時回傳 Response */
export async function readPostInput(request: Request): Promise<PostInput | Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('資料格式錯誤');
  }

  const { type, title, contentHtml, coverKey, published, publishedAt } = body;
  if (type !== 'announcement' && type !== 'interview') return badRequest('未知的文章類型');
  if (typeof title !== 'string' || !title.trim()) return badRequest('請輸入標題');
  if (title.length > 200) return badRequest('標題請勿超過 200 字');
  if (typeof contentHtml !== 'string') return badRequest('內容格式錯誤');
  if (!isDateString(publishedAt)) return badRequest('請選擇上版日期');
  if (coverKey != null && (typeof coverKey !== 'string' || !coverKey.startsWith('posts/'))) {
    return badRequest('封面圖片格式錯誤');
  }

  // Tiptap 會在結尾留下空段落
  const html = (await sanitizeHtml(contentHtml)).replace(/(<p><\/p>\s*)+$/, '');
  // 未指定封面時，取內文第一張上傳的圖片
  const cover = (coverKey as string | null) ?? mediaKeysIn(html).find((k) => k.startsWith('posts/')) ?? null;

  return {
    type,
    title: title.trim(),
    contentHtml: html,
    coverKey: cover,
    published: published !== false,
    publishedAt: parseTaipeiDate(publishedAt),
    excerpt: excerptOf(html),
  };
}

/** 刪除文章不再引用的 R2 圖片（只處理 posts/ 底下的檔案） */
export async function deleteUnusedMedia(before: Pick<Post, 'contentHtml' | 'coverKey'>, after?: Pick<Post, 'contentHtml' | 'coverKey'>) {
  const keysOf = (p: Pick<Post, 'contentHtml' | 'coverKey'>) =>
    new Set([...mediaKeysIn(p.contentHtml), ...(p.coverKey ? [p.coverKey] : [])].filter((k) => k.startsWith('posts/')));
  const still = after ? keysOf(after) : new Set<string>();
  const removed = [...keysOf(before)].filter((k) => !still.has(k));
  if (removed.length) await env.BUCKET.delete(removed);
}
