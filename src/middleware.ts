import { defineMiddleware } from 'astro:middleware';
import { getAdminEmail } from './lib/auth';

const isProtected = (path: string) =>
  path === '/admin' || path.startsWith('/admin/') || path.startsWith('/api/admin/');

export const onRequest = defineMiddleware(async (context, next) => {
  if (!isProtected(context.url.pathname)) return next();

  // 寫入 API 僅接受同源請求（防 CSRF）
  const method = context.request.method;
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = context.request.headers.get('origin');
    if (origin !== context.url.origin) {
      return new Response('Forbidden', { status: 403 });
    }
  }

  const email = await getAdminEmail(context.request);
  if (!email) {
    return new Response('需要登入才能使用後台。', {
      status: 403,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  context.locals.adminEmail = email;
  return next();
});
