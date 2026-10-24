import type { APIRoute } from 'astro';
import { env } from 'cloudflare:workers';

/** 由 R2 讀取檔案；支援 Range（PDF.js 分段載入）與 ETag 快取 */
export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key;
  if (!key) return new Response('Not found', { status: 404 });

  const object = await env.BUCKET.get(key, {
    range: request.headers,
    onlyIf: request.headers,
  });
  if (!object) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  // key 內含唯一 id，內容不會變動，可長期快取
  headers.set('cache-control', 'public, max-age=31536000, immutable');

  if (!('body' in object) || !object.body) {
    return new Response(null, { status: 304, headers });
  }

  const range = object.range as { offset: number; length: number } | undefined;
  if (range && request.headers.has('range')) {
    headers.set('content-range', `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    headers.set('content-length', String(range.length));
    return new Response(object.body, { status: 206, headers });
  }

  headers.set('content-length', String(object.size));
  return new Response(object.body, { headers });
};
