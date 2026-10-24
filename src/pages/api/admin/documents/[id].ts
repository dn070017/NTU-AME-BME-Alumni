import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { eq } from 'drizzle-orm';
import { db, schema } from '../../../../db';
import { json, notFound, parseId } from '../../../../lib/api';
import { readDocumentInput } from '../../../../lib/documents';

const findDoc = async (id: number) =>
  (await db.select().from(schema.documents).where(eq(schema.documents.id, id)).limit(1))[0];

export const PUT: APIRoute = async ({ params, request }) => {
  const id = parseId(params.id);
  const before = id && (await findDoc(id));
  if (!id || !before) return notFound();

  const input = await readDocumentInput(request);
  if (input instanceof Response) return input;

  await db
    .update(schema.documents)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(schema.documents.id, id));
  // 更換 PDF 時刪除舊檔
  if (before.pdfKey !== input.pdfKey) await env.BUCKET.delete(before.pdfKey);
  return json({ id });
};

export const DELETE: APIRoute = async ({ params }) => {
  const id = parseId(params.id);
  const before = id && (await findDoc(id));
  if (!id || !before) return notFound();

  await db.delete(schema.documents).where(eq(schema.documents.id, id));
  await env.BUCKET.delete(before.pdfKey);
  return json({ ok: true });
};
