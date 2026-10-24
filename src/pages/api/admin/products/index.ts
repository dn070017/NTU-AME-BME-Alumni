import type { APIRoute } from 'astro';
import { max } from 'drizzle-orm';
import { db, schema } from '../../../../db';
import { json } from '../../../../lib/api';
import { readProductInput } from '../../../../lib/products';

export const POST: APIRoute = async ({ request }) => {
  const input = await readProductInput(request);
  if (input instanceof Response) return input;

  // 新商品排在最後
  const [{ last }] = await db.select({ last: max(schema.products.sortOrder) }).from(schema.products);
  const [row] = await db
    .insert(schema.products)
    .values({ ...input, sortOrder: (last ?? -1) + 1 })
    .returning();
  return json(row, 201);
};
