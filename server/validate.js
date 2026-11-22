// Validação de entrada. Acumula erros por campo e responde 422 com mensagens em português.
import { HttpError } from './http.js';

const isRealDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(s + 'T00:00:00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};

export class Fields {
  constructor(src) {
    this.src = src && typeof src === 'object' ? src : {};
    this.errors = {};
    this.out = {};
  }
  _raw(name) {
    const v = this.src[name];
    return v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? null : v;
  }
  _set(name, v) {
    this.out[name] = v;
    return v;
  }
  err(name, msg) {
    this.errors[name] ??= msg;
    return null;
  }
  /** Texto de uma linha. */
  str(name, { label = name, required = false, max = 200 } = {}) {
    const raw = this._raw(name);
    if (raw === null) return this._set(name, required ? this.err(name, `${label} é obrigatório.`) : null);
    if (typeof raw !== 'string') return this._set(name, this.err(name, `${label} está em formato inválido.`));
    const v = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (v.length > max) return this._set(name, this.err(name, `${label} aceita até ${max} caracteres.`));
    return this._set(name, v);
  }
  /** Texto com várias linhas. */
  text(name, { label = name, required = false, max = 4000 } = {}) {
    const raw = this._raw(name);
    if (raw === null) return this._set(name, required ? this.err(name, `${label} é obrigatório.`) : null);
    if (typeof raw !== 'string') return this._set(name, this.err(name, `${label} está em formato inválido.`));
    const v = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim();
    if (v.length > max) return this._set(name, this.err(name, `${label} aceita até ${max} caracteres.`));
    return this._set(name, v);
  }
  int(name, { label = name, required = false, min = -Infinity, max = Infinity } = {}) {
    const raw = this._raw(name);
    if (raw === null) return this._set(name, required ? this.err(name, `${label} é obrigatório.`) : null);
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isInteger(n)) return this._set(name, this.err(name, `${label} precisa ser um número inteiro.`));
    if (n < min || n > max) return this._set(name, this.err(name, `${label} deve estar entre ${min} e ${max}.`));
    return this._set(name, n);
  }
  bool(name, { label = name } = {}) {
    const raw = this.src[name];
    if (raw === undefined || raw === null || raw === '') return this._set(name, null);
    if (raw === true || raw === 1 || raw === 'true') return this._set(name, 1);
    if (raw === false || raw === 0 || raw === 'false') return this._set(name, 0);
    return this._set(name, this.err(name, `${label} está em formato inválido.`));
  }
  date(name, { label = name, required = false } = {}) {
    const raw = this._raw(name);
    if (raw === null) return this._set(name, required ? this.err(name, `${label} é obrigatória.`) : null);
    if (typeof raw !== 'string' || !isRealDate(raw)) return this._set(name, this.err(name, `${label} não é uma data válida.`));
    return this._set(name, raw);
  }
  oneOf(name, options, { label = name, required = false } = {}) {
    const raw = this._raw(name);
    if (raw === null) return this._set(name, required ? this.err(name, `${label} é obrigatório.`) : null);
    if (!options.includes(raw)) return this._set(name, this.err(name, `${label} tem um valor inválido.`));
    return this._set(name, raw);
  }
  /** Lista de textos (aceita array ou texto separado por vírgula). */
  list(name, { label = name, maxItems = 30, maxLen = 80 } = {}) {
    let raw = this.src[name];
    if (raw === undefined || raw === null || raw === '') return this._set(name, []);
    if (typeof raw === 'string') raw = raw.split(/[,;\n]/);
    if (!Array.isArray(raw)) return this._set(name, this.err(name, `${label} está em formato inválido.`));
    const out = [];
    for (const item of raw) {
      if (typeof item !== 'string') return this._set(name, this.err(name, `${label} está em formato inválido.`));
      const v = item.replace(/\s+/g, ' ').trim();
      if (!v) continue;
      if (v.length > maxLen) return this._set(name, this.err(name, `Cada item de ${label} aceita até ${maxLen} caracteres.`));
      if (!out.some((x) => x.toLowerCase() === v.toLowerCase())) out.push(v);
    }
    if (out.length > maxItems) return this._set(name, this.err(name, `${label} aceita até ${maxItems} itens.`));
    return this._set(name, out);
  }
  done() {
    if (Object.keys(this.errors).length) {
      throw new HttpError(422, 'invalid', 'Confira os campos destacados.', this.errors);
    }
    return this.out;
  }
}

export const todayLocal = (tz = 'America/Sao_Paulo') =>
  new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
