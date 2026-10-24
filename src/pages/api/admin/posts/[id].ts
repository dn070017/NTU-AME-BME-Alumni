import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../db';
import { json, notFound, parseId } from '../../../../lib/api';
import { deleteUnusedMedia, readPostInput } from '../../../../lib/posts';

const findPost = async (id: number) =>
  (await db.select().from(schema.posts).where(eq(schema.posts.id, id)).limit(1))[0];

export const PUT: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id);
  const before = id && (await findPost(id));
  if (!id || !before) return notFound();

  const input = await readPostInput(request);
  if (input instanceof Response) return input;

  await db
    .update(schema.posts)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.posts.id, id));
  await deleteUnusedMedia(before, input);
  return json({ id });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = parseId(params.id);
  const before = id && (await findPost(id));
  if (!id || !before) return notFound();

  await db.delete(schema.posts).where(eq(schema.posts.id, id));
  await deleteUnusedMedia(before);
  return json({ ok: true });
};
