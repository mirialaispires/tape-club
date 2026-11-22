// Senhas (scrypt) e sessões por cookie assinado (HMAC). Sem dependências.
import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';

export const COOKIE = 'tc_session';
const SCRYPT = { N: 16384, r: 8, p: 1 };

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [alg, saltHex, hashHex] = String(stored).split('$');
  if (alg !== 'scrypt' || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), expected.length, SCRYPT);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

const sign = (secret, payload) => createHmac('sha256', secret).update(payload).digest('base64url');

/** O token carrega a "época" da conta: trocar a senha a incrementa e derruba sessões antigas. */
export function createSessionToken(secret, member, days = 45) {
  const payload = `${member.id}.${member.session_epoch}.${Date.now() + days * 86_400_000}`;
  return `${payload}.${sign(secret, payload)}`;
}

export function readSessionToken(secret, token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const payload = parts.slice(0, 3).join('.');
  const a = Buffer.from(parts[3]);
  const b = Buffer.from(sign(secret, payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [id, epoch, exp] = parts.slice(0, 3).map(Number);
  if (!Number.isInteger(id) || Date.now() > exp) return null;
  return { memberId: id, epoch };
}

export function sessionCookie(value, { secure, days = 45 }) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${days * 86400}${secure ? '; Secure' : ''}`;
}
export const clearCookie = (secure) =>
  `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;

export function checkPassword(password) {
  if (typeof password !== 'string' || password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (password.length > 200) return 'A senha é longa demais.';
  return null;
}
