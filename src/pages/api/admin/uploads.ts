import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';
import { badRequest, json, shortId } from '../../../lib/api';
import { mediaUrl } from '../../../lib/format';

const MB = 1024 * 1024;

/** 各資料夾允許的檔案類型與大小（圖片已於瀏覽器端壓縮，限制可以抓緊） */
const RULES: Record<string, { types: Record<string, string>; maxBytes: number }> = {
  posts: { types: { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' }, maxBytes: 10 * MB },
  documents: { types: { 'application/pdf': 'pdf' }, maxBytes: 50 * MB },
  products: { types: { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' }, maxBytes: 10 * MB },
};

export const POST: APIRoute = async ({ request }) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  const folder = String(form?.get('folder') ?? '');
  const rule = RULES[folder];

  if (!rule) return badRequest('未知的上傳類別');
  if (!(file instanceof File)) return badRequest('請選擇檔案');
  const ext = rule.types[file.type];
  if (!ext) return badRequest(`不支援的檔案類型：${file.type || '未知'}`);
  if (file.size > rule.maxBytes) return badRequest(`檔案過大（上限 ${rule.maxBytes / MB} MB）`);

  const key = `${folder}/${shortId()}.${ext}`;
  await env.BUCKET.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  return json({ key, url: mediaUrl(key) }, 201);
};
