/* ============================================================
   ToastManager — bottom-center transient message, shared by
   both pages.
   ============================================================ */
import { esc } from './utils.js';

export class ToastManager {
  constructor() {
    this.toast = null;
    this._timer = null;
  }

  show(msg, type, onExpire) {
    this.toast = { msg, type: type || 'default' };
    clearTimeout(this._timer);
    this._timer = setTimeout(() => { this.toast = null; if (onExpire) onExpire(); }, 3200);
  }

  render() {
    if (!this.toast) return '';
    const isError = this.toast.type === 'error';
    const bg = isError ? '#D6402F' : 'var(--ink)';
    return `<div style="position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:${bg};color:#fff;padding:12px 22px;border-radius:999px;font-size:13.5px;font-weight:600;box-shadow:var(--shadow-lg);z-index:200;max-width:90vw;text-align:center">${esc(this.toast.msg)}</div>`;
  }
}
