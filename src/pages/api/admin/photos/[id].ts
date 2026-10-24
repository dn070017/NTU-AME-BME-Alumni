import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../db';
import { json, notFound, parseId } from '../../../../lib/api';

export const DELETE: APIRoute = async ({ params }) => {
  const id = parseId(params.id);
  const [photo] = id ? await db.select().from(schema.photos).where(eq(schema.photos.id, id)).limit(1) : [];
  if (!id || !photo) return notFound();

  await db.batch([
    // 若刪的是封面，清除封面設定（前台改用第一張）
    db.update(schema.albums).set({ coverPhotoId: null }).where(eq(schema.albums.coverPhotoId, id)),
    db.delete(schema.photos).where(eq(schema.photos.id, id)),
  ]);
  await env.BUCKET.delete([photo.key, photo.thumbKey]);
  return json({ ok: true });
};
