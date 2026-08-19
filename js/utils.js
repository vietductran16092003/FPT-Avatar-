/* ============================================================
   Small stateless helpers shared by the public site and admin.
   ============================================================ */
import { T } from './i18n.js';

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

export function fmtNum(n, lang) {
  return n.toLocaleString(lang === 'vi' ? 'vi-VN' : 'en-US');
}

export function tenureLabel(joinYear, lang) {
  const n = new Date().getFullYear() - Number(joinYear);
  if (!Number.isFinite(n) || n <= 0) return T[lang].newJoiner;
  return `${n} ${T[lang].yearsAtFpt}`;
}

export function campaignStatus(c) {
  const now = new Date(); const s = new Date(c.startDate); const e = new Date(c.endDate); e.setHours(23,59,59,999);
  if (c.status !== 'active') return c.status;
  if (now < s) return 'upcoming';
  if (now > e) return 'closed';
  return 'active';
}
