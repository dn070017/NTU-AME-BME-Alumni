import type { APIRoute } from 'astro';
import { db, schema } from '../../../../db';
import { json } from '../../../../lib/api';
import { readDocumentInput } from '../../../../lib/documents';

export const POST: APIRoute = async ({ request }) => {
  const input = await readDocumentInput(request);
  if (input instanceof Response) return input;

  const [row] = await db.insert(schema.documents).values(input).returning({ id: schema.documents.id });
  return json({ id: row.id }, 201);
};
