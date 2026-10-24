import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../db';
import { json, notFound, parseId } from '../../../../lib/api';
import { readProductInput } from '../../../../lib/products';

const findProduct = async (id: number) =>
  (await db.select().from(schema.products).where(eq(schema.products.id, id)).limit(1))[0];

export const PUT: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id);
  const before = id && (await findProduct(id));
  if (!id || !before) return notFound();

  const input = await readProductInput(request);
  if (input instanceof Response) return input;

  const [row] = await db
    .update(schema.products)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.products.id, id))
    .returning();
  // 更換或移除圖片時刪除舊檔
  if (before.imageKey && before.imageKey !== input.imageKey) await env.BUCKET.delete(before.imageKey);
  return json(row);
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = parseId(params.id);
  const before = id && (await findProduct(id));
  if (!id || !before) return notFound();

  await db.delete(schema.products).where(eq(schema.products.id, id));
  if (before.imageKey) await env.BUCKET.delete(before.imageKey);
  return json({ ok: true });
};
