import type { APIRoute } from 'astro';
import { db, schema } from '../../../../db';
import { json } from '../../../../lib/api';
import { readAlbumInput } from '../../../../lib/albums';

export const POST: APIRoute = async ({ request }) => {
  const input = await readAlbumInput(request);
  if (input instanceof Response) return input;

  const { title, description, published, publishedAt } = input;
  const [row] = await db
    .insert(schema.albums)
    .values({ title, description, published, publishedAt })
    .returning({ id: schema.albums.id });
  return json({ id: row.id }, 201);
};
