import { and, eq } from 'drizzle-orm';
import { db, schema } from '../db';
import type { Document } from '../db/schema';
import { badRequest, isDateString, parseId } from './api';
import { parseTaipeiDate } from './format';

export type DocumentInput = Pick<Document, 'type' | 'title' | 'pdfKey' | 'pdfSize' | 'published' | 'publishedAt'>;

export async function readDocumentInput(request: Request): Promise<DocumentInput | Response> {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return badRequest('資料格式錯誤');
  }

  const { type, title, pdfKey, pdfSize, published, publishedAt } = body;
  if (type !== 'lecture' && type !== 'resource') return badRequest('未知的資料類型');
  if (typeof title !== 'string' || !title.trim()) return badRequest('請輸入標題');
  if (title.length > 200) return badRequest('標題請勿超過 200 字');
  if (typeof pdfKey !== 'string' || !/^documents\/[\w-]+\.pdf$/.test(pdfKey)) return badRequest('請上傳 PDF 檔案');
  if (!isDateString(publishedAt)) return badRequest('請選擇上版日期');

  return {
    type,
    title: title.trim(),
    pdfKey,
    pdfSize: typeof pdfSize === 'number' ? pdfSize : null,
    published: published !== false,
    publishedAt: parseTaipeiDate(publishedAt),
  };
}

/** 前台：取得已公開的單份 PDF 資料 */
export async function getPublishedDoc(type: Document['type'], rawId: string | undefined) {
  const id = parseId(rawId);
  if (!id) return undefined;
  const [doc] = await db
    .select()
    .from(schema.documents)
    .where(and(eq(schema.documents.id, id), eq(schema.documents.type, type), eq(schema.documents.published, true)))
    .limit(1);
  return doc;
}
