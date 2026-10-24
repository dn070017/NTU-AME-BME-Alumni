import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, jwtVerify } from 'jose';

/**
 * 後台驗證交由 Cloudflare Access：Access 在請求抵達 Worker 前完成登入，
 * 並附上 `Cf-Access-Jwt-Assertion` header。這裡再驗證一次 JWT，
 * 避免有人繞過 Access 直接打 *.workers.dev 網址。
 * https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/
 */

let jwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let jwksDomain: string | undefined;

function getJwks(teamDomain: string) {
  if (!jwks || jwksDomain !== teamDomain) {
    jwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
    jwksDomain = teamDomain;
  }
  return jwks;
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/** 回傳登入者 email；未通過驗證回傳 null */
export async function getAdminEmail(request: Request): Promise<string | null> {
  const url = new URL(request.url);

  // 本地開發略過驗證：必須同時設定 DEV_BYPASS_AUTH 且來自本機，避免正式環境誤開
  if (env.DEV_BYPASS_AUTH === 'true' && LOCAL_HOSTS.has(url.hostname)) {
    return env.DEV_ADMIN_EMAIL || 'dev@localhost';
  }

  const teamDomain: string = env.CF_ACCESS_TEAM_DOMAIN;
  const aud: string = env.CF_ACCESS_AUD;
  if (!teamDomain || !aud) {
    console.error('Cloudflare Access 尚未設定：缺少 CF_ACCESS_TEAM_DOMAIN 或 CF_ACCESS_AUD');
    return null;
  }

  const token = request.headers.get('cf-access-jwt-assertion');
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getJwks(teamDomain), {
      issuer: teamDomain,
      audience: aud,
    });
    return typeof payload.email === 'string' ? payload.email : null;
  } catch (err) {
    console.warn('Access JWT 驗證失敗', err);
    return null;
  }
}
