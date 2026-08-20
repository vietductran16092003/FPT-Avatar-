/* ============================================================
   PublicApp — public site (login, campaign list, avatar creator).
   Admin lives in AdminApp; both share AppStore/I18n and bridge
   edits via localStorage.

   Styling note: every visual rule for this file's markup lives in
   styles.css under matching class names (e.g. .campaign-card,
   .template-option) — this file only ever sets a dynamic value
   that CSS cannot know ahead of time (a per-template frame color,
   a drag transform, a visibility flag). If you're adding markup
   here, add its class to styles.css instead of an inline style.
   ============================================================ */
import { I18n } from '../config/i18n.js';
import { FRAME_COLORS, getComponentDef } from '../config/constants.js';
import { esc, tenureLabel, campaignStatus } from '../config/utils.js';
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
      loginModalOpen: false,
      loginUsername: '', // kept across a failed submit so the visitor doesn't have to retype it; password is intentionally not preserved
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
    if (this.state.view === 'login') return this.renderLogin() + this.toast.render();
    const chrome = this.renderUserHeader();
    let body = '';
    if (this.state.view === 'home') body = this.renderHome();
    else if (this.state.view === 'campaign') body = this.renderCampaign();
    return chrome + body + this.toast.render();
  }

  renderLogin() {
    return `
    <div class="login-page">
      <div class="login-page__lang">${this.langToggle()}</div>
      <div class="card login-card">
        <div class="brand-mark login-card__brand"><img src="assets/fpt-logo.webp" alt="FPT" /></div>
        <div class="login-card__title">${esc(this.t('loginTitle'))}</div>
        <div class="login-card__subtitle">${esc(this.t('loginSubtitle'))}</div>
        <button data-action="open-login-modal" class="btn btn-dark btn--block login-card__submit">
          <span class="ms-logo"><span></span><span></span><span></span><span></span></span>
          ${esc(this.t('loginButton'))}
        </button>
        <div class="login-card__footer">${esc(this.t('loginFooter'))}</div>
      </div>
      ${this.state.loginModalOpen ? this.renderLoginModal() : ''}
    </div>`;
  }

  /* Mock credential gate: this FE prototype has no real Azure AD behind it
     yet (see spec §4.1), so this modal only checks that both fields are
     non-empty before letting the visitor through to the home page. */
  renderLoginModal() {
    return `
    <div class="modal-overlay" data-action="close-login-modal">
      <div class="card modal-box">
        <div class="modal-box__header">
          <div class="modal-box__title">${esc(this.t('loginModalTitle'))}</div>
          <button type="button" data-action="close-login-modal" class="modal-box__close" aria-label="${esc(this.t('loginCancel'))}">✕</button>
        </div>
        <div class="field field--stacked"><label for="login-username">${esc(this.t('fUsername'))}</label><input type="text" id="login-username" autocomplete="username" value="${esc(this.state.loginUsername)}" /></div>
        <div class="field"><label for="login-password">${esc(this.t('fPassword'))}</label><input type="password" id="login-password" autocomplete="current-password" /></div>
        <div class="modal-box__actions">
          <button type="button" data-action="submit-login" class="btn btn-primary">${esc(this.t('loginSubmit'))}</button>
          <button type="button" data-action="close-login-modal" class="btn btn-ghost">${esc(this.t('loginCancel'))}</button>
        </div>
      </div>
    </div>`;
  }

  langToggle() {
    return `<div class="lang-toggle" role="group" aria-label="VI/EN">
      <button data-action="lang" data-lang="vi" class="${this.lang==='vi'?'active':''}">VI</button>
      <button data-action="lang" data-lang="en" class="${this.lang==='en'?'active':''}">EN</button>
    </div>`;
  }

  // Header cho trang public — chỉ dành cho nhân viên thường, KHÔNG hiện link
  // "Trang quản trị" hay danh tính admin (khác admin.html, có header riêng).
  renderUserHeader() {
    return `
    <div class="app-header">
      <div class="app-header__brand app-header__brand--clickable" data-action="home">
        <div class="brand-mark brand-mark--header"><img src="assets/fpt-logo.webp" alt="FPT" /></div>
        <div class="app-header__title">Avatar Frame Platform</div>
      </div>
      <div class="app-header__actions">
        ${this.langToggle()}
        ${this.bell.render(this.lang, this.state.notifOpen)}
      </div>
    </div>`;
  }

  /* ---------------- Home ---------------- */
  renderHome() {
    // Public trang chủ chỉ được hiện Campaign admin đã bật status "active"
    // (kể cả khi đã qua ngày kết thúc, vẫn hiện mờ/disabled — nhưng "draft"
    // và "archived" thì không bao giờ lộ ra ngoài, đúng spec mục 3.2/3.3).
    const publicCampaigns = this.store.campaigns.filter(c => c.status === 'active');
    if (!publicCampaigns.length) {
      return `
      <div class="page-container">
        <div class="hero">
          <div class="hero__title">${esc(this.t('heroTitle'))}</div>
          <div class="hero__subtitle">${esc(this.t('heroSubtitle'))}</div>
        </div>
        <div class="empty-state">
          <div class="empty-state__title">${esc(this.t('noCampaignsTitle'))}</div>
          <div class="empty-state__sub">${esc(this.t('noCampaignsSub'))}</div>
        </div>
      </div>`;
    }
    const cards = publicCampaigns.map(c => {
      const st = campaignStatus(c);
      const statusLabel = st === 'active' ? this.t('statusActive') : st === 'closed' ? this.t('statusClosed') : this.t('statusUpcoming');
      const pillClass = st === 'active' ? 'pill-live' : st === 'closed' ? 'pill-archived' : 'pill-draft';
      const title = this.lang === 'vi' ? c.title : c.titleEn;
      const desc = this.lang === 'vi' ? c.description : c.descriptionEn;
      const cta = this.lang === 'vi' ? c.cta : c.ctaEn;
      // Admin có thể bật một Campaign "active" trước khi kịp thêm khung ảnh
      // nào, hoặc xoá hết khung của một Campaign đang chạy — chặn ngay ở đây
      // thay vì để trang chi tiết crash khi cố đọc c.templates[0].id.
      const notReady = !c.templates.length;
      return `
      <div class="card campaign-card">
        <div class="campaign-card__media" style="background:linear-gradient(155deg, color-mix(in srgb, ${esc(FRAME_COLORS[c.templates[0]?.id]||'#F5760A')} 22%, #eef1f5), #dfe6ee)">
          <div class="campaign-card__status pill ${pillClass}">${esc(statusLabel)}</div>
          <div class="campaign-card__badge badge-pill">${esc(c.badge)}</div>
        </div>
        <div class="campaign-card__body">
          <div class="campaign-card__title">${esc(title)}</div>
          <div class="campaign-card__desc">${esc(desc)}</div>
          <div class="campaign-card__dates tabular-nums">${esc(c.startDate)} – ${esc(c.endDate)}</div>
          ${notReady ? `<div class="text-muted-italic-sm">${esc(this.t('campaignNotReady'))}</div>` : ''}
          <button data-action="open-campaign" data-slug="${esc(c.slug)}" class="btn btn-primary" ${st==='closed'||notReady?'disabled':''}>${esc(cta)}</button>
        </div>
      </div>`;
    }).join('');

    return `
    <div class="page-container">
      <div class="hero">
        <div class="hero__title">${esc(this.t('heroTitle'))}</div>
        <div class="hero__subtitle">${esc(this.t('heroSubtitle'))}</div>
      </div>
      <div class="campaign-grid">${cards}</div>
    </div>`;
  }

  /* ---------------- Campaign detail ---------------- */
  // Shared "this campaign isn't accessible right now" screen — used for a
  // closed campaign, a non-active one (draft/archived), and one with no
  // templates yet, so the visitor always gets an explanation instead of a
  // broken page.
  renderCampaignNotice(title, message) {
    return `<div class="closed-page">
      <a href="#" data-action="home">${esc(this.t('backHome'))}</a>
      <div class="card closed-page__card">
        <div class="closed-page__title">${esc(title)}</div>
        <div class="muted">${esc(message)}</div>
      </div>
    </div>`;
  }

  resetComponentValues(slug, tpl) {
    const values = {};
    (tpl.components || []).forEach(key => {
      const def = getComponentDef(key);
      if (def && def.type === 'select') values[key] = def.getOptions()[0];
    });
    this.state.componentValues[slug] = values;
  }

  ensureCampaignDefaults(slug) {
    const c = this.store.findCampaign(slug); if (!c || !c.templates.length) return;
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
    // Defense in depth: home only links to status:'active' campaigns, but an
    // admin could flip a campaign to draft/archived while this tab already
    // has it open. Never let a non-active campaign render the creation flow —
    // draft campaigns especially are explicitly "not published yet" (spec
    // §3.2), so this tab must fall back to the same notice as a closed one.
    if (c.status !== 'active') {
      return this.renderCampaignNotice(this.lang === 'vi' ? c.title : c.titleEn, this.t('closedNotice'));
    }
    // Same crash this used to hit when opened with zero templates (see
    // renderHome's `notReady` guard) — a direct/stale link could still
    // reach this branch, so it needs its own guard too.
    if (!c.templates.length) {
      return this.renderCampaignNotice(this.lang === 'vi' ? c.title : c.titleEn, this.t('campaignNotReady'));
    }
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
      return this.renderCampaignNotice(title, this.t('closedNotice'));
    }

    const templateOpts = c.templates.map(tp => {
      // Real uploaded PNG wins; templates that never got one still show the
      // colored-ring placeholder so they remain pickable and recognizable.
      const media = tp.frameImageUrl
        ? `<div class="template-option__media template-option__media--image"><img src="${tp.frameImageUrl}" alt="" /></div>`
        : `<div class="template-option__media" style="background:linear-gradient(155deg, color-mix(in srgb, ${esc(FRAME_COLORS[tp.id]||'#F5760A')} 24%, #eef1f5), #dfe6ee)">
             <div class="template-option__ring" style="border-color:${esc(FRAME_COLORS[tp.id]||'#F5760A')}"></div>
           </div>`;
      return `
      <div data-action="select-template" data-tpl="${esc(tp.id)}" class="template-option ${tp.id===sel?'template-option--active':''}">
        ${media}
        <div class="template-option__label">${esc(tp.name)}</div>
      </div>`;
    }).join('');

    const step3Fields = (tpl.components && tpl.components.length) ? tpl.components.map(key => {
      const def = getComponentDef(key);
      if (!def) return '';
      const label = lang === 'vi' ? def.label : def.labelEn;
      const val = values[key] || '';
      if (def.type === 'select') {
        const opts = def.getOptions().map(o => `<option value="${esc(o)}" ${o===val?'selected':''}>${esc(o)}</option>`).join('');
        return `<div class="field field--stacked"><label for="comp-${key}">${esc(label)}</label><select id="comp-${key}" data-comp-key="${key}">${opts}</select></div>`;
      }
      const placeholder = lang === 'vi' ? def.placeholder : def.placeholderEn;
      return `<div class="field field--stacked"><label for="comp-${key}">${esc(label)} <span class="field__optional-hint">(${lang==='vi'?'không bắt buộc':'optional'})</span></label><input type="text" id="comp-${key}" data-comp-key="${key}" value="${esc(val)}" placeholder="${esc(placeholder||'')}" maxlength="40" /></div>`;
    }).join('') : `<div class="text-muted-italic-sm">${esc(this.t('noComponents'))}</div>`;

    const warningBanner = this.state.downloadWarning ? `
      <div class="warning-banner" id="download-warning">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M12 9v4M12 17h.01M10.29 3.86l-8.18 14.18A2 2 0 003.82 21h16.36a2 2 0 001.71-3l-8.18-14.14a2 2 0 00-3.42 0z"/></svg>
        <div><b>${esc(this.t('warnTitle'))}</b>${esc(photo ? this.t('warnIncompleteFields') : this.t('warnMissingPhoto'))}</div>
      </div>` : '';

    const photoStage = photo ? `
      <div class="photo-stage" id="photo-stage">
        <img id="photo-stage-img" src="${photo}" alt="" draggable="false"
          style="transform:translate(${transform.ox*100}%, ${transform.oy*100}%) scale(${transform.scale})" />
      </div>` : `<div class="preview-stage__placeholder"></div>`;

    return `
    <div class="campaign-detail">
      <a href="#" data-action="home">${esc(this.t('backHome'))}</a>
      <div class="campaign-detail__header">
        <div class="badge-pill">${esc(c.badge)}</div>
        <div class="campaign-detail__title">${esc(title)}</div>
        <div class="campaign-detail__dates">${esc(c.startDate)} – ${esc(c.endDate)}</div>
      </div>

      <div id="campaign-grid">
        <div class="campaign-detail__col">
          <div id="step1-upload-block">
            <div class="step-title step-title--tight">${esc(this.t('stepUpload'))}</div>
            <div class="step-hint">${esc(this.t('stepUploadHint'))}</div>
            ${photo ? `
              <div class="upload-preview-row">
                <img src="${photo}" alt="" class="upload-preview-thumb" />
                <button data-action="pick-photo" class="btn btn-ghost btn-sm">${esc(this.t('changePhoto'))}</button>
              </div>` : `
              <div data-action="pick-photo" class="upload-dropzone">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="1.8" width="30" height="30" class="upload-dropzone__icon"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>
                <div class="upload-dropzone__title">${esc(this.t('dropTitle'))}</div>
                <div class="upload-dropzone__sub">${esc(this.t('dropSub'))}</div>
              </div>`}
            <input type="file" id="photo-input" accept="image/png,image/jpeg" class="hidden" />
          </div>

          <div>
            <div class="step-title">${esc(this.t('stepTemplate'))}</div>
            <div class="template-grid">${templateOpts}</div>
          </div>

          <div class="step3-block" id="step3-fields">
            <div class="step-title">${esc(this.t('stepOverlay'))}</div>
            ${step3Fields}
            <div id="badge-preview-hint" class="badge-preview-hint">→ ${esc(badgeText)}</div>
          </div>
        </div>

        <div class="card preview-card">
          <div class="step-title">${esc(this.t('previewTitle'))}</div>
          <div class="preview-stage">
            ${photoStage}
            ${tpl.frameImageUrl
              ? `<img class="preview-stage__frame-image" src="${tpl.frameImageUrl}" alt="" />`
              : `<div class="preview-stage__ring" style="border-color:${esc(frameColor)}"></div>`}
            <div id="preview-badge" class="preview-badge" style="background:${esc(frameColor)}">${esc(badgeText)}</div>
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
          </div>` : `<div class="spacer-sm"></div>`}
          <div class="preview-note">${esc(this.t('previewNote'))}</div>
          ${warningBanner}
          <button id="download-btn" data-action="download" data-slug="${esc(c.slug)}" class="btn btn-primary btn--block download-btn" ${this.stepsComplete(c.slug)?'':'disabled'}>${esc(this.t('downloadButton'))}</button>
          <div id="download-hint" class="download-hint" style="${this.stepsComplete(c.slug)?'visibility:hidden':''}">${esc(lang==='vi' ? (photo ? 'Vui lòng điền đầy đủ thông tin ở Bước 3 để tải ảnh.' : 'Vui lòng tải ảnh và điền thông tin để tải xuống.') : (photo ? 'Please fill in all Step 3 fields to download.' : 'Please upload a photo and fill in the fields to download.'))}</div>
          <div class="share-title">${esc(this.t('shareTitle'))}</div>
          <div class="share-row">
            <div class="share-icon share-icon--fb">FB</div>
            <div class="share-icon share-icon--zalo">Zalo</div>
            <div class="share-icon share-icon--in">in</div>
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
        case 'delete-notification': this.store.deleteNotification(el.dataset.id); this.render(); break;
        case 'clear-notifications':
          if (!confirm(this.t('confirmClearNotifications'))) break;
          this.store.clearNotifications();
          this.render();
          break;
        case 'home': this.store.load(); this.go('home'); break;
        case 'open-login-modal': this.state.loginModalOpen = true; this.render(); break;
        case 'close-login-modal':
          // The overlay itself and the ✕/Huỷ buttons all carry this action.
          // Only the overlay must ignore clicks that bubbled up from inside
          // the modal box — e.currentTarget is the element the listener is
          // bound to, e.target is what was actually clicked.
          if (e.currentTarget !== e.target) break;
          this.state.loginModalOpen = false;
          this.render();
          break;
        case 'submit-login': this.handleLoginSubmit(); break;
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

  handleLoginSubmit() {
    const username = document.getElementById('login-username')?.value.trim() || '';
    const password = document.getElementById('login-password')?.value.trim() || '';
    if (!username || !password) {
      this.state.loginUsername = username; // re-render below would otherwise blank an already-typed username
      this.showToast(this.t('loginValidationRequired'), 'error');
      this.render();
      this.markInvalid('login-username', !username);
      this.markInvalid('login-password', !password);
      return;
    }
    this.state.loginModalOpen = false;
    this.state.loginUsername = '';
    this.store.load();
    this.go('home');
  }

  markInvalid(id, invalid) {
    const el = document.getElementById(id);
    if (!el) return;
    if (invalid) { el.style.borderColor = '#D6402F'; el.classList.add('shake-error'); setTimeout(() => el.classList.remove('shake-error'), 500); }
    else { el.style.borderColor = ''; }
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
    AvatarComposer.compose(c, badgeText, filenamePart, this.state.uploadedPhoto[slug], transform, frameColor, tpl.frameImageUrl)
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
