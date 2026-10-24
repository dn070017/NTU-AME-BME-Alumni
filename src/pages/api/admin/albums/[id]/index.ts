import type { APIRoute } from 'astro';
import { and, eq } from 'drizzle-orm';
import { db, schema } from '../../../../../db';
import { badRequest, json, notFound, parseId } from '../../../../../lib/api';
import { albumPhotos, deleteAlbumMedia, readAlbumInput } from '../../../../../lib/albums';

const findAlbum = async (id: number) =>
  (await db.select().from(schema.albums).where(eq(schema.albums.id, id)).limit(1))[0];

export const PUT: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id);
  if (!id || !(await findAlbum(id))) return notFound();

  const input = await readAlbumInput(request);
  if (input instanceof Response) return input;

  const photos = await albumPhotos(id);
  const ids = new Set(photos.map((p) => p.id));
  if (input.coverPhotoId != null && !ids.has(input.coverPhotoId)) return badRequest('封面照片不在此相簿中');

  const { title, description, published, publishedAt, coverPhotoId = null, photoOrder } = input;
  const updates = [
    db
      .update(schema.albums)
      .set({ title, description, published, publishedAt, coverPhotoId, updatedAt: new Date() })
      .where(eq(schema.albums.id, id)),
    ...(photoOrder ?? [])
      .filter((pid) => ids.has(pid))
      .map((pid, i) =>
        db
          .update(schema.photos)
          .set({ sortOrder: i })
          .where(and(eq(schema.photos.id, pid), eq(schema.photos.albumId, id))),
      ),
  ] as const;
  await db.batch(updates);
  return json({ id });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = parseId(params.id);
  if (!id || !(await findAlbum(id))) return notFound();

  await db.batch([
    db.delete(schema.photos).where(eq(schema.photos.albumId, id)),
    db.delete(schema.albums).where(eq(schema.albums.id, id)),
  ]);
  await deleteAlbumMedia(id);
  return json({ ok: true });
};
