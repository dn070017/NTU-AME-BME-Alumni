import { env } from 'cloudflare:workers';
import { asc, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import { badRequest, isDateString } from './api';
import { parseTaipeiDate } from './format';

export type AlbumInput = {
  title: string;
  description: string | null;
  published: boolean;
  publishedAt: Date;
  coverPhotoId?: number | null;
  /** 照片排序（photo id 陣列），僅更新時使用 */
  photoOrder?: number[];
};

export async function readAlbumInput(request: Request): Promise<AlbumInput | Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('資料格式錯誤');
  }

  const { title, description, published, publishedAt, coverPhotoId, photoOrder } = body;
  if (typeof title !== 'string' || !title.trim()) return badRequest('請輸入相簿標題');
  if (title.length > 200) return badRequest('標題請勿超過 200 字');
  if (description != null && typeof description !== 'string') return badRequest('說明格式錯誤');
  if (!isDateString(publishedAt)) return badRequest('請選擇活動日期');
  if (coverPhotoId != null && !Number.isInteger(coverPhotoId)) return badRequest('封面格式錯誤');
  if (photoOrder != null && !(Array.isArray(photoOrder) && photoOrder.every(Number.isInteger))) {
    return badRequest('照片排序格式錯誤');
  }

  return {
    title: title.trim(),
    description: (description as string | null)?.trim() || null,
    published: published !== false,
    publishedAt: parseTaipeiDate(publishedAt),
    coverPhotoId: coverPhotoId as number | null | undefined,
    photoOrder: photoOrder as number[] | undefined,
  };
}

export const albumPhotos = (albumId: number) =>
  db
    .select()
    .from(schema.photos)
    .where(eq(schema.photos.albumId, albumId))
    .orderBy(asc(schema.photos.sortOrder), asc(schema.photos.id));

/** 刪除整本相簿在 R2 的檔案（albums/<id>/ 底下全部） */
export async function deleteAlbumMedia(albumId: number) {
  const prefix = `albums/${albumId}/`;
  let cursor: string | undefined;
  do {
    const list = await env.BUCKET.list({ prefix, cursor });
    if (list.objects.length) await env.BUCKET.delete(list.objects.map((o) => o.key));
    cursor = list.truncated ? list.cursor : undefined;
  } while (cursor);
}
