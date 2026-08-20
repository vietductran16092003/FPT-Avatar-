/* ============================================================
   NotificationBell — bell icon + dropdown panel, reused verbatim
   by the public site and the admin console. Visual rules live in
   styles.css under .notif-* — this file only sets the per-item
   icon color, which depends on notification type at render time.
   ============================================================ */
import { T } from '../config/i18n.js';
import { esc } from '../config/utils.js';

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
    return `<div class="notif-wrap" id="notif-wrap">
      <button type="button" data-action="toggle-notif" aria-label="${esc(T[lang].notifTitle)}" class="notif-button">
        <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        ${unread > 0 ? `<span class="notif-badge">${unread>9?'9+':unread}</span>` : ''}
      </button>
      ${open ? this.renderPanel(lang) : ''}
    </div>`;
  }

  renderPanel(lang) {
    const items = this.store.notifications.slice(0, 30).map(n => `
      <div class="notif-item ${n.read?'':'notif-item--unread'}">
        <div class="notif-item__icon" style="background:color-mix(in srgb, ${this.iconColor(n.type)} 14%, transparent);color:${this.iconColor(n.type)}">${this.icon(n.type)}</div>
        <div class="notif-item__body">
          <div class="notif-item__text">${esc(lang==='vi'?n.vi:n.en)}</div>
          <div class="notif-item__time">${esc(this.formatRelativeTime(n.ts, lang))}</div>
        </div>
        <button type="button" data-action="delete-notification" data-id="${esc(n.id)}" class="notif-item__delete" aria-label="${esc(T[lang].notifDeleteOne)}">✕</button>
      </div>`).join('');
    const hasItems = this.store.notifications.length > 0;
    return `<div class="notif-panel">
      <div class="notif-panel__header">
        <div class="notif-panel__title">${esc(T[lang].notifTitle)}</div>
        <div class="notif-panel__actions">
          ${hasItems ? `<button type="button" data-action="mark-all-read" class="btn btn-ghost btn-sm notif-panel__mark-all">${esc(T[lang].notifMarkAllRead)}</button>` : ''}
          ${hasItems ? `<button type="button" data-action="clear-notifications" class="btn btn-danger-ghost btn-sm notif-panel__mark-all">${esc(T[lang].notifClearAll)}</button>` : ''}
        </div>
      </div>
      ${items || `<div class="notif-empty">${esc(T[lang].notifEmpty)}</div>`}
    </div>`;
  }
}
