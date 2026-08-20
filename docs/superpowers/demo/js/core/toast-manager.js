/* ============================================================
   ToastManager — bottom-center transient message, shared by
   both pages. Visual rules live in styles.css (.toast, .toast--error).
   ============================================================ */
import { esc } from '../config/utils.js';

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
    return `<div class="toast ${isError ? 'toast--error' : ''}">${esc(this.toast.msg)}</div>`;
  }
}
