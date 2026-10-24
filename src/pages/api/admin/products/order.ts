import type { APIRoute } from 'astro';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../db';
import { badRequest, json } from '../../../../lib/api';

/** 更新商品陳列順序：{ ids: number[] } */
export const PUT: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { ids?: unknown } | null;
  const ids = body?.ids;
  if (!Array.isArray(ids) || !ids.length || !ids.every(Number.isInteger)) return badRequest('排序格式錯誤');

  const [first, ...rest] = (ids as number[]).map((id, i) =>
    db.update(schema.products).set({ sortOrder: i }).where(eq(schema.products.id, id)),
  );
  await db.batch([first, ...rest]);
  return json({ ok: true });
};
