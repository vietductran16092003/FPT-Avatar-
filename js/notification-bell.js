/* ============================================================
   NotificationBell — bell icon + dropdown panel, reused verbatim
   by the public site and the admin console.
   ============================================================ */
import { T } from './i18n.js';
import { esc } from './utils.js';

export class NotificationBell {
  constructor(store) {
    this.store = store;
  }

  icon(type) {
    if (type === 'download') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>`;
    if (type === 'campaign-create') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><path d="M12 5v14M5 12h14"/></svg>`;
    if (type === 'campaign-delete') return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>`;
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" width="15" height="15"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"/></svg>`;
  }

  iconColor(type) {
    if (type === 'download') return 'var(--green)';
    if (type === 'campaign-create') return 'var(--blue)';
    if (type === 'campaign-delete') return '#D6402F';
    return 'var(--orange)';
  }

  formatRelativeTime(ts, lang) {
    const diff = Math.max(0, Date.now() - ts);
    const min = Math.floor(diff / 60000);
    if (min < 1) return T[lang].notifJustNow;
    if (min < 60) return `${min} ${T[lang].notifMinAgo}`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr} ${T[lang].notifHourAgo}`;
    const d = new Date(ts);
    return d.toLocaleDateString(lang === 'vi' ? 'vi-VN' : 'en-US') + ' ' + d.toLocaleTimeString(lang === 'vi' ? 'vi-VN' : 'en-US', { hour: '2-digit', minute: '2-digit' });
  }

  render(lang, open) {
    const unread = this.store.unreadCount();
    return `<div style="position:relative" id="notif-wrap">
      <button type="button" data-action="toggle-notif" aria-label="${esc(T[lang].notifTitle)}" style="position:relative;width:36px;height:36px;border-radius:10px;border:1px solid var(--border);background:var(--surface);display:flex;align-items:center;justify-content:center;color:var(--ink-soft);flex-shrink:0">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        ${unread > 0 ? `<span style="position:absolute;top:-5px;right:-5px;background:#D6402F;color:#fff;font-size:10px;font-weight:800;min-width:16px;height:16px;border-radius:999px;display:flex;align-items:center;justify-content:center;padding:0 4px;line-height:1">${unread>9?'9+':unread}</span>` : ''}
      </button>
      ${open ? this.renderPanel(lang) : ''}
    </div>`;
  }

  renderPanel(lang) {
    const items = this.store.notifications.slice(0, 30).map(n => `
      <div style="display:flex;gap:10px;padding:12px 14px;border-bottom:1px solid var(--border);background:${n.read?'transparent':'color-mix(in srgb, var(--orange) 6%, transparent)'}">
        <div style="width:26px;height:26px;border-radius:8px;background:color-mix(in srgb, ${this.iconColor(n.type)} 14%, transparent);color:${this.iconColor(n.type)};display:flex;align-items:center;justify-content:center;flex-shrink:0">${this.icon(n.type)}</div>
        <div style="min-width:0">
          <div style="font-size:12.5px;font-weight:600;line-height:1.4;word-break:break-word">${esc(lang==='vi'?n.vi:n.en)}</div>
          <div style="font-size:11px;color:var(--ink-soft);margin-top:3px">${esc(this.formatRelativeTime(n.ts, lang))}</div>
        </div>
      </div>`).join('');
    return `<div style="position:absolute;top:44px;right:0;width:320px;max-height:420px;overflow:auto;background:var(--surface);border:1px solid var(--border);border-radius:14px;box-shadow:var(--shadow-lg);z-index:150">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid var(--border);position:sticky;top:0;background:var(--surface)">
        <div style="font-weight:800;font-size:13.5px">${esc(T[lang].notifTitle)}</div>
        <button type="button" data-action="mark-all-read" class="btn btn-ghost btn-sm" style="padding:4px 10px;font-size:11px">${esc(T[lang].notifMarkAllRead)}</button>
      </div>
      ${items || `<div style="padding:28px 16px;text-align:center;color:var(--ink-soft);font-size:12.5px">${esc(T[lang].notifEmpty)}</div>`}
    </div>`;
  }
}
