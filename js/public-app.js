/* ============================================================
   PublicApp — public site (login, campaign list, avatar creator).
   Admin lives in AdminApp; both share AppStore/I18n and bridge
   edits via localStorage.
   ============================================================ */
import { I18n } from './i18n.js';
import { FRAME_COLORS, getComponentDef } from './constants.js';
import { esc, tenureLabel, campaignStatus } from './utils.js';
import { AppStore } from './store.js';
import { NotificationBell } from './notification-bell.js';
import { ToastManager } from './toast-manager.js';
import { AvatarComposer } from './avatar-composer.js';

const MIN_ZOOM = 1, MAX_ZOOM = 3, ZOOM_STEP = 0.1;

export class PublicApp {
  constructor(root) {
    this.root = root;
    this.store = new AppStore();
    this.i18n = new I18n('vi');
    this.bell = new NotificationBell(this.store);
    this.toast = new ToastManager();

    this.state = {
      view: 'login',
      activeSlug: null,
      templateSelections: {},
      componentValues: {}, // { [slug]: { [componentKey]: value } }
      uploadedPhoto: {},
      photoTransform: {}, // { [slug]: { scale, ox, oy } }  ox/oy are fractions of container size
      downloadWarning: false,
      notifOpen: false,
    };
  }

  init() {
    this.store.load();
    this.render();
    document.addEventListener('click', e => this.closeNotifOnOutsideClick(e), true);
  }

  t(key) { return this.i18n.t(key); }
  get lang() { return this.i18n.lang; }

  render() {
    this.root.innerHTML = this.renderRoot();
    this.attachHandlers();
  }
  go(view, extra) {
    Object.assign(this.state, { view }, extra || {});
    this.render();
    window.scrollTo({ top: 0 });
  }

  getTransform(slug) {
    if (!this.state.photoTransform[slug]) this.state.photoTransform[slug] = { scale: 1, ox: 0, oy: 0 };
    return this.state.photoTransform[slug];
  }

  renderRoot() {
    if (this.state.view === 'login') return this.renderLogin();
    const chrome = this.renderUserHeader();
    let body = '';
    if (this.state.view === 'home') body = this.renderHome();
    else if (this.state.view === 'campaign') body = this.renderCampaign();
    return chrome + body + this.toast.render();
  }

  renderLogin() {
    return `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;position:relative;background:
      radial-gradient(circle at 12% 15%, color-mix(in srgb, var(--orange) 10%, transparent), transparent 55%),
      radial-gradient(circle at 90% 10%, color-mix(in srgb, var(--blue) 10%, transparent), transparent 50%),
      radial-gradient(circle at 80% 92%, color-mix(in srgb, var(--green) 10%, transparent), transparent 55%), var(--bg)">
      <div style="position:absolute;top:24px;right:32px">${this.langToggle()}</div>
      <div class="card" style="width:100%;max-width:420px;padding:40px 36px;text-align:center;box-shadow:var(--shadow-lg)">
        <div class="brand-mark" style="width:88px;height:56px;border-radius:12px;padding:6px;margin:0 auto 20px"><img src="assets/fpt-logo.webp" alt="FPT" /></div>
        <div style="font-weight:800;font-size:22px;letter-spacing:-.01em;margin-bottom:8px">${esc(this.t('loginTitle'))}</div>
        <div style="font-size:14.5px;color:var(--ink-soft);margin-bottom:28px">${esc(this.t('loginSubtitle'))}</div>
        <button data-action="login" class="btn btn-dark" style="width:100%;justify-content:center;padding:14px 18px;font-size:15px">
          <span style="width:18px;height:18px;background:#fff;border-radius:3px;display:grid;grid-template-columns:1fr 1fr;gap:2px;padding:2px">
            <span style="background:#F25022"></span><span style="background:#7FBA00"></span><span style="background:#00A4EF"></span><span style="background:#FFB900"></span>
          </span>
          ${esc(this.t('loginButton'))}
        </button>
        <div style="font-size:12.5px;color:var(--ink-soft);margin-top:18px">${esc(this.t('loginFooter'))}</div>
      </div>
    </div>`;
  }

  langToggle() {
    return `<div class="lang-toggle" role="group" aria-label="VI/EN">
      <button data-action="lang" data-lang="vi" class="${this.lang==='vi'?'active':''}">VI</button>
      <button data-action="lang" data-lang="en" class="${this.lang==='en'?'active':''}">EN</button>
    </div>`;
  }

  renderUserHeader() {
    return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 32px;border-bottom:1px solid var(--border);background:var(--surface);flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:10px;cursor:pointer" data-action="home">
        <div class="brand-mark" style="width:54px;height:34px;border-radius:8px;padding:4px"><img src="assets/fpt-logo.webp" alt="FPT" /></div>
        <div style="font-weight:700;font-size:15.5px">Avatar Frame Platform</div>
      </div>
      <div style="display:flex;align-items:center;gap:16px">
        ${this.langToggle()}
        <a href="admin.html">${esc(this.t('goAdmin'))}</a>
        ${this.bell.render(this.lang, this.state.notifOpen)}
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:30px;height:30px;border-radius:999px;background:#FDE6D2;color:var(--orange-deep);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">VĐ</div>
          <span style="font-size:13.5px;font-weight:600;color:var(--ink-soft)">Việt Đức</span>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- Home ---------------- */
  renderHome() {
    const cards = this.store.campaigns.map(c => {
      const st = campaignStatus(c);
      const statusLabel = st === 'active' ? this.t('statusActive') : st === 'closed' ? this.t('statusClosed') : this.t('statusUpcoming');
      const pillClass = st === 'active' ? 'pill-live' : st === 'closed' ? 'pill-archived' : 'pill-draft';
      const title = this.lang === 'vi' ? c.title : c.titleEn;
      const desc = this.lang === 'vi' ? c.description : c.descriptionEn;
      const cta = this.lang === 'vi' ? c.cta : c.ctaEn;
      return `
      <div class="card" style="overflow:hidden;display:flex;flex-direction:column">
        <div style="aspect-ratio:16/9;position:relative;background:linear-gradient(155deg, color-mix(in srgb, ${esc(FRAME_COLORS[c.templates[0]?.id]||'#F5760A')} 22%, #eef1f5), #dfe6ee)">
          <div style="position:absolute;top:12px;left:12px;background:#fff" class="pill ${pillClass}">${esc(statusLabel)}</div>
          <div style="position:absolute;top:12px;right:12px;background:var(--orange);color:#fff;font-size:12px;font-weight:800;padding:5px 12px;border-radius:999px">${esc(c.badge)}</div>
        </div>
        <div style="padding:22px;display:flex;flex-direction:column;gap:6px;flex:1">
          <div style="font-size:18px;font-weight:700">${esc(title)}</div>
          <div style="font-size:13.5px;color:var(--ink-soft);line-height:1.55;flex:1">${esc(desc)}</div>
          <div style="font-size:12px;color:var(--ink-soft);margin:4px 0 12px;font-variant-numeric:tabular-nums">${esc(c.startDate)} – ${esc(c.endDate)}</div>
          <button data-action="open-campaign" data-slug="${esc(c.slug)}" class="btn btn-primary" ${st==='closed'?'disabled':''}>${esc(cta)}</button>
        </div>
      </div>`;
    }).join('');

    return `
    <div style="max-width:1080px;margin:0 auto;padding:56px 32px 80px">
      <div style="margin-bottom:36px">
        <div style="font-size:28px;font-weight:800;letter-spacing:-.01em;margin-bottom:8px;text-wrap:balance">${esc(this.t('heroTitle'))}</div>
        <div style="font-size:15px;color:var(--ink-soft)">${esc(this.t('heroSubtitle'))}</div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:24px">${cards}</div>
    </div>`;
  }

  /* ---------------- Campaign detail ---------------- */
  resetComponentValues(slug, tpl) {
    const values = {};
    (tpl.components || []).forEach(key => {
      const def = getComponentDef(key);
      if (def && def.type === 'select') values[key] = def.getOptions()[0];
    });
    this.state.componentValues[slug] = values;
  }

  ensureCampaignDefaults(slug) {
    const c = this.store.findCampaign(slug); if (!c) return;
    if (!this.state.templateSelections[slug]) this.state.templateSelections[slug] = c.templates[0].id;
    const tpl = c.templates.find(x => x.id === this.state.templateSelections[slug]);
    if (!this.state.componentValues[slug]) this.resetComponentValues(slug, tpl);
    this.getTransform(slug);
  }

  /* Combine every filled Step-3 component into one badge string, e.g.
     "3 năm làm FPT · Dream Big, Move Fast" */
  composeBadgeText(tpl, values, lang) {
    const parts = (tpl.components || []).map(key => {
      const val = (values || {})[key];
      if (!val) return null;
      return key === 'joinYear' ? tenureLabel(val, lang) : val;
    }).filter(Boolean);
    return parts.length ? parts.join(' · ') : 'FPT';
  }

  /* All Step-3 components (if any) must have a value, and a photo must be
     uploaded, before the download button becomes clickable. */
  stepsComplete(slug) {
    if (!this.state.uploadedPhoto[slug]) return false;
    const c = this.store.findCampaign(slug);
    const tplId = this.state.templateSelections[slug];
    const tpl = c && c.templates.find(x => x.id === tplId);
    if (!tpl) return false;
    const values = this.state.componentValues[slug] || {};
    return (tpl.components || []).every(key => !!(values[key] && String(values[key]).trim()));
  }

  renderCampaign() {
    const c = this.store.findCampaign(this.state.activeSlug);
    if (!c) return '';
    const st = campaignStatus(c);
    const lang = this.lang;
    const sel = this.state.templateSelections[c.slug] || c.templates[0].id;
    const tpl = c.templates.find(x => x.id === sel) || c.templates[0];
    if (!this.state.componentValues[c.slug]) this.resetComponentValues(c.slug, tpl);
    const values = this.state.componentValues[c.slug];
    const badgeText = this.composeBadgeText(tpl, values, lang);
    const photo = this.state.uploadedPhoto[c.slug];
    const transform = this.getTransform(c.slug);
    const title = lang === 'vi' ? c.title : c.titleEn;
    const frameColor = FRAME_COLORS[tpl.id] || '#F5760A';

    if (st === 'closed') {
      return `<div style="max-width:640px;margin:0 auto;padding:80px 32px;text-align:center">
        <a href="#" data-action="home">${esc(this.t('backHome'))}</a>
        <div class="card" style="margin-top:24px;padding:40px;">
          <div style="font-size:19px;font-weight:800;margin-bottom:8px">${esc(title)}</div>
          <div style="color:var(--ink-soft)">${esc(this.t('closedNotice'))}</div>
        </div>
      </div>`;
    }

    const templateOpts = c.templates.map(tp => `
      <div data-action="select-template" data-tpl="${esc(tp.id)}" style="border:2px solid ${tp.id===sel?'var(--orange)':'var(--border)'};border-radius:12px;cursor:pointer;overflow:hidden;background:var(--surface);${tp.id===sel?'box-shadow:0 0 0 3px color-mix(in srgb, var(--orange) 18%, transparent)':''}">
        <div style="aspect-ratio:1/1;position:relative;background:linear-gradient(155deg, color-mix(in srgb, ${esc(FRAME_COLORS[tp.id]||'#F5760A')} 24%, #eef1f5), #dfe6ee)">
          <div style="position:absolute;inset:10%;border-radius:8px;border:6px solid ${esc(FRAME_COLORS[tp.id]||'#F5760A')};box-shadow:inset 0 0 0 2px #fff"></div>
        </div>
        <div style="padding:7px 6px;text-align:center;font-size:10.5px;font-weight:700;color:var(--ink-soft);line-height:1.3">${esc(tp.name)}</div>
      </div>`).join('');

    const step3Fields = (tpl.components && tpl.components.length) ? tpl.components.map(key => {
      const def = getComponentDef(key);
      if (!def) return '';
      const label = lang === 'vi' ? def.label : def.labelEn;
      const val = values[key] || '';
      if (def.type === 'select') {
        const opts = def.getOptions().map(o => `<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o)}</option>`).join('');
        return `<div class="field" style="margin-bottom:14px"><label for="comp-${key}">${esc(label)}</label><select id="comp-${key}" data-comp-key="${key}">${opts}</select></div>`;
      }
      const placeholder = lang === 'vi' ? def.placeholder : def.placeholderEn;
      return `<div class="field" style="margin-bottom:14px"><label for="comp-${key}">${esc(label)} <span style="font-weight:400;color:var(--ink-soft)">(${lang==='vi'?'không bắt buộc':'optional'})</span></label><input type="text" id="comp-${key}" data-comp-key="${key}" value="${esc(val)}" placeholder="${esc(placeholder||'')}" maxlength="40" /></div>`;
    }).join('') : `<div style="font-size:12.5px;color:var(--ink-soft);font-style:italic">${esc(this.t('noComponents'))}</div>`;

    const warningBanner = this.state.downloadWarning ? `
      <div class="warning-banner" id="download-warning">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14.18A2 2 0 003.82 21h16.36a2 2 0 001.71-3l-8.18-14.14a2 2 0 00-3.42 0z"/></svg>
        <div><b>${esc(this.t('warnTitle'))}</b>${esc(photo ? this.t('warnIncompleteFields') : this.t('warnMissingPhoto'))}</div>
      </div>` : '';

    const photoStage = photo ? `
      <div class="photo-stage" id="photo-stage">
        <img id="photo-stage-img" src="${photo}" alt="" draggable="false"
          style="transform:translate(${transform.ox*100}%, ${transform.oy*100}%) scale(${transform.scale})" />
      </div>` : `<div style="width:100%;height:100%;background:linear-gradient(155deg,#eef1f5,#dfe6ee)"></div>`;

    return `
    <div style="max-width:1080px;margin:0 auto;padding:32px 32px 80px">
      <a href="#" data-action="home">${esc(this.t('backHome'))}</a>
      <div style="display:flex;align-items:center;gap:12px;margin:14px 0 32px;flex-wrap:wrap">
        <div style="background:var(--orange);color:#fff;font-size:12px;font-weight:800;padding:5px 13px;border-radius:999px">${esc(c.badge)}</div>
        <div style="font-size:24px;font-weight:800;letter-spacing:-.01em">${esc(title)}</div>
        <div style="font-size:12.5px;color:var(--ink-soft)">${esc(c.startDate)} – ${esc(c.endDate)}</div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:start" id="campaign-grid">
        <div style="display:flex;flex-direction:column;gap:32px;min-width:0">
          <div id="step1-upload-block">
            <div style="font-size:15px;font-weight:700;margin-bottom:4px">${esc(this.t('stepUpload'))}</div>
            <div style="font-size:13px;color:var(--ink-soft);margin-bottom:14px">${esc(this.t('stepUploadHint'))}</div>
            ${photo ? `
              <div style="display:flex;align-items:center;gap:14px">
                <img src="${photo}" alt="" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:1px solid var(--border)" />
                <button data-action="pick-photo" class="btn btn-ghost btn-sm">${esc(this.t('changePhoto'))}</button>
              </div>` : `
              <div data-action="pick-photo" style="border:2px dashed var(--border-strong);border-radius:14px;padding:30px 18px;text-align:center;cursor:pointer;background:var(--bg)">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="1.8" width="30" height="30" style="margin:0 auto 8px"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>
                <div style="font-weight:700;font-size:13.5px;margin-bottom:2px">${esc(this.t('dropTitle'))}</div>
                <div style="font-size:12px;color:var(--ink-soft)">${esc(this.t('dropSub'))}</div>
              </div>`}
            <input type="file" id="photo-input" accept="image/png,image/jpeg" class="hidden" />
          </div>

          <div>
            <div style="font-size:15px;font-weight:700;margin-bottom:14px">${esc(this.t('stepTemplate'))}</div>
            <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:14px;max-width:320px">${templateOpts}</div>
          </div>

          <div class="step3-block" style="max-width:320px" id="step3-fields">
            <div style="font-size:15px;font-weight:700;margin-bottom:14px">${esc(this.t('stepOverlay'))}</div>
            ${step3Fields}
            <div id="badge-preview-hint" style="font-size:12.5px;color:var(--blue-deep);font-weight:600">→ ${esc(badgeText)}</div>
          </div>
        </div>

        <div class="card" style="padding:24px;position:sticky;top:24px;min-width:0">
          <div style="font-size:15px;font-weight:700;margin-bottom:14px">${esc(this.t('previewTitle'))}</div>
          <div style="position:relative;aspect-ratio:1/1;margin-bottom:6px;border-radius:14px;overflow:hidden;box-shadow:inset 0 0 0 1px rgba(16,30,46,.16)">
            ${photoStage}
            <div style="position:absolute;inset:6%;border-radius:12px;border:9px solid ${esc(frameColor)};box-shadow:inset 0 0 0 2px #fff;pointer-events:none"></div>
            <div id="preview-badge" style="position:absolute;bottom:14px;left:50%;transform:translateX(-50%);max-width:88%;background:${esc(frameColor)};color:#fff;font-family:inherit;font-weight:800;font-size:12.5px;padding:6px 15px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;pointer-events:none">${esc(badgeText)}</div>
          </div>
          ${photo ? `
          <div class="zoom-row">
            <button type="button" class="zoom-btn" data-action="zoom-out" aria-label="Thu nhỏ">−</button>
            <input type="range" id="zoom-range" min="${MIN_ZOOM}" max="${MAX_ZOOM}" step="0.01" value="${transform.scale}" aria-label="Zoom" />
            <button type="button" class="zoom-btn" data-action="zoom-in" aria-label="Phóng to">+</button>
          </div>
          <div class="zoom-hint">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M8 9l-4 4 4 4M16 9l4 4-4 4M4 13h16"/></svg>
            ${esc(this.t('zoomHint'))}
          </div>` : `<div style="margin-bottom:14px"></div>`}
          <div style="font-size:12px;line-height:1.5;color:var(--ink-soft);margin-bottom:18px">${esc(this.t('previewNote'))}</div>
          ${warningBanner}
          <button id="download-btn" data-action="download" data-slug="${esc(c.slug)}" class="btn btn-primary" style="width:100%;justify-content:center;margin-bottom:8px" ${this.stepsComplete(c.slug)?'':'disabled'}>${esc(this.t('downloadButton'))}</button>
          <div id="download-hint" style="font-size:11.5px;color:var(--ink-soft);text-align:center;margin-bottom:16px;${this.stepsComplete(c.slug)?'visibility:hidden':''}">${esc(lang==='vi' ? (photo ? 'Vui lòng điền đầy đủ thông tin ở Bước 3 để tải ảnh.' : 'Vui lòng tải ảnh và điền thông tin để tải xuống.') : (photo ? 'Please fill in all Step 3 fields to download.' : 'Please upload a photo and fill in the fields to download.'))}</div>
          <div style="font-size:12.5px;font-weight:700;color:var(--ink-soft);margin-bottom:10px">${esc(this.t('shareTitle'))}</div>
          <div style="display:flex;gap:10px">
            <div style="width:36px;height:36px;border-radius:9px;background:var(--muted-bg);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--blue)">FB</div>
            <div style="width:36px;height:36px;border-radius:9px;background:var(--muted-bg);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--green)">Zalo</div>
            <div style="width:36px;height:36px;border-radius:9px;background:var(--muted-bg);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:var(--ink-soft)">in</div>
          </div>
        </div>
      </div>
    </div>`;
  }

  /* ---------------- Photo drag / zoom ---------------- */
  attachPhotoStageHandlers() {
    const stage = document.getElementById('photo-stage');
    const img = document.getElementById('photo-stage-img');
    if (!stage || !img) return;
    const slug = this.state.activeSlug;
    let dragging = false, startX = 0, startY = 0, startOx = 0, startOy = 0;

    const applyStyle = (scale, ox, oy) => {
      img.style.transform = `translate(${ox*100}%, ${oy*100}%) scale(${scale})`;
    };
    const clamp = v => Math.max(-0.45, Math.min(0.45, v));

    img.addEventListener('pointerdown', e => {
      dragging = true; img.classList.add('dragging'); img.setPointerCapture(e.pointerId);
      const tr = this.getTransform(slug);
      startX = e.clientX; startY = e.clientY; startOx = tr.ox; startOy = tr.oy;
    });
    img.addEventListener('pointermove', e => {
      if (!dragging) return;
      const rect = stage.getBoundingClientRect();
      const tr = this.getTransform(slug);
      const nx = clamp(startOx + (e.clientX - startX) / rect.width);
      const ny = clamp(startOy + (e.clientY - startY) / rect.height);
      tr.ox = nx; tr.oy = ny;
      applyStyle(tr.scale, nx, ny);
    });
    const endDrag = e => {
      if (!dragging) return;
      dragging = false; img.classList.remove('dragging');
      try { img.releasePointerCapture(e.pointerId); } catch(err) {}
    };
    img.addEventListener('pointerup', endDrag);
    img.addEventListener('pointercancel', endDrag);

    const range = document.getElementById('zoom-range');
    if (range) range.addEventListener('input', e => {
      const tr = this.getTransform(slug);
      tr.scale = Number(e.target.value);
      applyStyle(tr.scale, tr.ox, tr.oy);
    });
  }

  /* ---------------- Step 3 dynamic fields ---------------- */
  attachStep3Handlers() {
    const container = document.getElementById('step3-fields');
    if (!container) return;
    const slug = this.state.activeSlug;
    container.querySelectorAll('[data-comp-key]').forEach(el => {
      const key = el.dataset.compKey;
      const eventName = el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(eventName, e => {
        this.state.componentValues[slug][key] = e.target.value;
        this.updateBadgePreview();
        this.updateDownloadButtonState();
      });
    });
  }

  updateBadgePreview() {
    const c = this.store.findCampaign(this.state.activeSlug);
    const tpl = c.templates.find(x => x.id === this.state.templateSelections[this.state.activeSlug]) || c.templates[0];
    const text = this.composeBadgeText(tpl, this.state.componentValues[this.state.activeSlug], this.lang);
    const pill = document.getElementById('preview-badge');
    const hint = document.getElementById('badge-preview-hint');
    if (pill) pill.textContent = text;
    if (hint) hint.textContent = '→ ' + text;
  }

  updateDownloadButtonState() {
    const btn = document.getElementById('download-btn');
    const hint = document.getElementById('download-hint');
    const warning = document.getElementById('download-warning');
    const ok = this.stepsComplete(this.state.activeSlug);
    if (btn) btn.disabled = !ok;
    if (hint) hint.style.visibility = ok ? 'hidden' : 'visible';
    if (ok) { this.state.downloadWarning = false; if (warning) warning.remove(); }
  }

  stepZoom(delta) {
    const tr = this.getTransform(this.state.activeSlug);
    tr.scale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, +(tr.scale + delta).toFixed(2)));
    const img = document.getElementById('photo-stage-img');
    const range = document.getElementById('zoom-range');
    if (img) img.style.transform = `translate(${tr.ox*100}%, ${tr.oy*100}%) scale(${tr.scale})`;
    if (range) range.value = tr.scale;
  }

  /* ---------------- Event handlers ---------------- */
  attachHandlers() {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', e => this.onAction(e));
    });
    this.attachStep3Handlers();
    const photoInput = document.getElementById('photo-input');
    if (photoInput) photoInput.addEventListener('change', e => {
      const file = e.target.files[0]; if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        this.state.uploadedPhoto[this.state.activeSlug] = ev.target.result;
        this.state.photoTransform[this.state.activeSlug] = { scale: 1, ox: 0, oy: 0 };
        this.state.downloadWarning = false;
        this.render();
      };
      reader.readAsDataURL(file);
    });
    this.attachPhotoStageHandlers();
  }

  /* Registered once, in the capture phase so it runs before the bell's own
     toggle handler (bubble phase) — otherwise the click that opens the panel
     would immediately close it again after render() detaches the old target. */
  closeNotifOnOutsideClick(e) {
    if (!this.state.notifOpen) return;
    const wrap = document.getElementById('notif-wrap');
    if (wrap && !wrap.contains(e.target)) { this.state.notifOpen = false; this.render(); }
  }

  onAction(e) {
    const el = e.currentTarget;
    const action = el.dataset.action;
    try {
      switch (action) {
        case 'lang': this.i18n.setLang(el.dataset.lang); this.render(); break;
        case 'toggle-notif': this.store.load(); this.state.notifOpen = !this.state.notifOpen; this.render(); break;
        case 'mark-all-read': this.store.markAllRead(); this.render(); break;
        case 'login': this.store.load(); this.go('home'); break;
        case 'home': this.store.load(); this.go('home'); break;
        case 'open-campaign': {
          const slug = el.dataset.slug;
          this.ensureCampaignDefaults(slug);
          this.state.downloadWarning = false;
          this.go('campaign', { activeSlug: slug });
          break;
        }
        case 'pick-photo': document.getElementById('photo-input')?.click(); break;
        case 'select-template': {
          const slug = this.state.activeSlug;
          const c = this.store.findCampaign(slug);
          const tpl = c.templates.find(x => x.id === el.dataset.tpl);
          this.state.templateSelections[slug] = tpl.id;
          this.resetComponentValues(slug, tpl);
          this.render();
          break;
        }
        case 'zoom-in': this.stepZoom(ZOOM_STEP); break;
        case 'zoom-out': this.stepZoom(-ZOOM_STEP); break;
        case 'download': this.handleDownload(el); break;
      }
    } catch (err) {
      console.error(err);
      this.showToast(this.t('errorGeneric'), 'error');
    }
  }

  handleDownload(el) {
    const slug = el.dataset.slug;
    if (!this.stepsComplete(slug)) {
      this.state.downloadWarning = true;
      this.showToast(this.state.uploadedPhoto[slug] ? this.t('warnIncompleteFields') : this.t('warnMissingPhoto'), 'error');
      this.render();
      const target = document.getElementById(this.state.uploadedPhoto[slug] ? 'step3-fields' : 'step1-upload-block');
      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const box = target.querySelector('[data-action="pick-photo"]') || target;
        box.classList.add('shake-error'); setTimeout(() => box.classList.remove('shake-error'), 500);
      }
      return;
    }
    this.state.downloadWarning = false;
    const c = this.store.findCampaign(slug);
    const tplId = this.state.templateSelections[slug] || c.templates[0].id;
    const tpl = c.templates.find(x => x.id === tplId) || c.templates[0];
    const badgeText = this.composeBadgeText(tpl, this.state.componentValues[slug], this.lang);
    const filenamePart = (tpl.components && tpl.components[0] && this.state.componentValues[slug][tpl.components[0]]) || tpl.name;
    const transform = this.getTransform(slug);
    const frameColor = FRAME_COLORS[tpl.id] || '#F5760A';
    const btn = el; btn.disabled = true;
    AvatarComposer.compose(c, badgeText, filenamePart, this.state.uploadedPhoto[slug], transform, frameColor)
      .then(filename => {
        this.store.recordDownload(slug);
        this.store.addNotification(
          `Tải ảnh thành công: ${filename}`,
          `Download successful: ${filename}`,
          'download'
        );
        this.showToast(`${this.t('downloadSuccessPrefix')} ${filename}`);
        this.render();
      })
      .catch(() => {
        this.showToast(this.t('errorGeneric'), 'error');
        btn.disabled = false;
      });
  }

  showToast(msg, type) {
    this.toast.show(msg, type, () => this.render());
  }
}
