export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });

export const badRequest = (message: string) => json({ error: message }, 400);
export const notFound = () => json({ error: '找不到資料' }, 404);

export const parseId = (raw: string | undefined) => {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
};

export const isDateString = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

export const shortId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
