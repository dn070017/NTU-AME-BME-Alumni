import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq, max } from 'drizzle-orm';
import { db, schema } from '../../../../../db';
import { badRequest, json, notFound, parseId, shortId } from '../../../../../lib/api';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * 新增一張照片。瀏覽器端已產生大圖（2400px）與縮圖（600px）WebP，
 * 以 multipart 送出：large、thumb、width、height。
 */
export const POST: APIRoute = async ({ params, request }) => {
  const albumId = parseId(params.id);
  const [album] = albumId
    ? await db.select({ id: schema.albums.id }).from(schema.albums).where(eq(schema.albums.id, albumId)).limit(1)
    : [];
  if (!albumId || !album) return notFound();

  const form = await request.formData().catch(() => null);
  const large = form?.get('large');
  const thumb = form?.get('thumb');
  const width = Number(form?.get('width'));
  const height = Number(form?.get('height'));
  if (!(large instanceof File) || !(thumb instanceof File)) return badRequest('缺少照片檔案');
  if (large.type !== 'image/webp' || thumb.type !== 'image/webp') return badRequest('照片需轉為 WebP 後上傳');
  if (large.size > MAX_BYTES || thumb.size > MAX_BYTES) return badRequest('照片檔案過大');
  if (!(width > 0 && height > 0)) return badRequest('缺少照片尺寸');

  const id = shortId();
  const key = `albums/${albumId}/${id}.webp`;
  const thumbKey = `albums/${albumId}/${id}-thumb.webp`;
  const meta = { httpMetadata: { contentType: 'image/webp' } };
  await Promise.all([env.BUCKET.put(key, await large.arrayBuffer(), meta), env.BUCKET.put(thumbKey, await thumb.arrayBuffer(), meta)]);

  const [{ last }] = await db.select({ last: max(schema.photos.sortOrder) }).from(schema.photos).where(eq(schema.photos.albumId, albumId));
  const [photo] = await db
    .insert(schema.photos)
    .values({ albumId, key, thumbKey, width: Math.round(width), height: Math.round(height), sortOrder: (last ?? -1) + 1 })
    .returning();
  return json(photo, 201);
};
