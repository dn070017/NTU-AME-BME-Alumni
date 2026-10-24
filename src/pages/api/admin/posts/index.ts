import type { APIRoute } from 'astro';
import { db, schema } from '../../../../db';
import { json } from '../../../../lib/api';
import { readPostInput } from '../../../../lib/posts';

export const POST: APIRoute = async ({ request }) => {
  const input = await readPostInput(request);
  if (input instanceof Response) return input;

  const [row] = await db.insert(schema.posts).values(input).returning({ id: schema.posts.id });
  return json({ id: row.id }, 201);
};
