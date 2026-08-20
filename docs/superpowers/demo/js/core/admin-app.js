/* ============================================================
   AdminApp — admin console. Frames live nested inside the
   campaign they belong to, and each frame's Step-3 fields are
   ticked from a shared component registry. Public site lives in
   PublicApp; both share AppStore/I18n and bridge edits via
   localStorage.

   Styling note: every visual rule for this file's markup lives in
   styles.css (.admin-*, .frame-card, .form-*, .chart-card, ...) —
   this file only ever sets a dynamic value CSS cannot know ahead
   of time (a per-frame color, a bar's fill %, an active-tab flag).
   If you're adding markup here, add its class to styles.css
   instead of an inline style.
   ============================================================ */
import { I18n } from '../config/i18n.js';
import { FRAME_COLORS, COMPONENT_DEFS, componentLabel, statusMeta } from '../config/constants.js';
import { esc, fmtNum, campaignStatus } from '../config/utils.js';
import { AppStore, analytics } from './store.js';
import { NotificationBell } from './notification-bell.js';
import { ToastManager } from './toast-manager.js';

export class AdminApp {
  constructor(root) {
    this.root = root;
    this.store = new AppStore();
    this.i18n = new I18n('vi');
    this.bell = new NotificationBell(this.store);
    this.toast = new ToastManager();

    this.state = {
      adminTab: 'campaigns',
      campaignFormOpen: false, editingCampaignSlug: null, draftCampaign: {},
      templateFormOpen: false, editingTemplateId: null, draftTemplate: {},
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

  renderRoot() {
    return this.renderAdminHeader() + this.renderAdmin() + this.toast.render();
  }

  langToggle() {
    return `<div class="lang-toggle" role="group" aria-label="VI/EN">
      <button data-action="lang" data-lang="vi" class="${this.lang==='vi'?'active':''}">VI</button>
      <button data-action="lang" data-lang="en" class="${this.lang==='en'?'active':''}">EN</button>
    </div>`;
  }

  renderAdminHeader() {
    return `
    <div class="app-header app-header--admin">
      <div class="app-header__brand">
        <div class="brand-mark brand-mark--admin"><img src="assets/fpt-logo.webp" alt="FPT" /></div>
        <div class="app-header__title app-header__title--admin">Avatar Frame Platform <span class="app-header__title-suffix">· Admin</span></div>
      </div>
      <div class="app-header__actions">
        ${this.langToggle()}
        <a href="index.html">${esc(this.t('adminLogout'))}</a>
        ${this.bell.render(this.lang, this.state.notifOpen)}
        <div class="avatar-badge">VĐ</div>
      </div>
    </div>`;
  }

  /* ---------------- Admin shell ---------------- */
  navItem(id, label) {
    const active = this.state.adminTab === id;
    return `<div data-action="admin-tab" data-tab="${id}" class="admin-nav__item ${active?'admin-nav__item--active':''}">${esc(label)}</div>`;
  }

  renderAdmin() {
    return `
    <div id="admin-shell">
      <div class="admin-nav">
        ${this.navItem('campaigns', this.t('adminCampaigns'))}
        ${this.navItem('analytics', this.t('adminAnalytics'))}
      </div>
      <div id="admin-main">
        ${this.state.adminTab === 'campaigns' ? this.renderAdminCampaigns() : ''}
        ${this.state.adminTab === 'analytics' ? this.renderAdminAnalytics() : ''}
      </div>
    </div>`;
  }

  /* ---------------- Campaigns (+ nested frames) ---------------- */
  renderAdminCampaigns() {
    const rows = this.store.campaigns.map(c => `
      <tr>
        <td class="td--slug">/c/${esc(c.slug)}</td>
        <td class="td--title">${esc(c.title)}</td>
        <td>${esc(c.language.toUpperCase())}</td>
        <td class="td--dates">${esc(c.startDate)} – ${esc(c.endDate)}</td>
        <td><span data-action="cycle-status" data-slug="${esc(c.slug)}" class="pill ${statusMeta[c.status]}">${esc(this.t('statusOpt'+c.status[0].toUpperCase()+c.status.slice(1)))}</span></td>
        <td class="td--count">${c.templates.length}</td>
        <td class="td--actions"><button data-action="edit-campaign" data-slug="${esc(c.slug)}" class="btn btn-ghost btn-sm">${esc(this.t('adminEdit'))}</button></td>
      </tr>`).join('');

    const d = this.state.draftCampaign || {};
    const editingCampaign = this.state.editingCampaignSlug ? this.store.findCampaign(this.state.editingCampaignSlug) : null;

    const form = this.state.campaignFormOpen ? `
      <div class="card form-card">
        <div class="form-card__title">${esc(this.t('campaignFormTitle'))}</div>
        <div class="form-grid">
          <div class="field"><label>${esc(this.t('fSlug'))}</label><input id="cf-slug" type="text" value="${esc(d.slug||'')}" /></div>
          <div class="field"><label>${esc(this.t('fLang'))}</label>
            <select id="cf-language"><option value="vi" ${d.language!=='en'?'selected':''}>Tiếng Việt</option><option value="en" ${d.language==='en'?'selected':''}>English</option></select>
          </div>
          <div class="field"><label>${esc(this.t('fStart'))}</label><input id="cf-start" type="date" value="${esc(d.startDate||'')}" /></div>
          <div class="field"><label>${esc(this.t('fEnd'))}</label><input id="cf-end" type="date" value="${esc(d.endDate||'')}" /></div>
          <div class="field"><label>${esc(this.t('fStatus'))}</label>
            <select id="cf-status">
              <option value="draft" ${d.status==='draft'?'selected':''}>${esc(this.t('statusOptDraft'))}</option>
              <option value="active" ${d.status==='active'?'selected':''}>${esc(this.t('statusOptActive'))}</option>
              <option value="archived" ${d.status==='archived'?'selected':''}>${esc(this.t('statusOptArchived'))}</option>
            </select>
          </div>
          <div class="field"><label>${esc(this.t('fBadge'))}</label><input id="cf-badge" type="text" value="${esc(d.badge||'')}" /></div>
        </div>
        <div class="form-grid">
          <div class="field"><label>${esc(this.t('fTitle'))}</label><input id="cf-title" type="text" value="${esc(d.title||'')}" /></div>
          <div class="field"><label>${esc(this.t('fTitleEn'))}</label><input id="cf-titleEn" type="text" value="${esc(d.titleEn||'')}" /></div>
          <div class="field"><label>${esc(this.t('fDesc'))}</label><textarea id="cf-description">${esc(d.description||'')}</textarea></div>
          <div class="field"><label>${esc(this.t('fDescEn'))}</label><textarea id="cf-descriptionEn">${esc(d.descriptionEn||'')}</textarea></div>
          <div class="field"><label>${esc(this.t('fCta'))}</label><input id="cf-cta" type="text" value="${esc(d.cta||'')}" /></div>
          <div class="field"><label>${esc(this.t('fCtaEn'))}</label><input id="cf-ctaEn" type="text" value="${esc(d.ctaEn||'')}" /></div>
        </div>
        <div class="form-note">${esc(this.t('bilingualNote'))}</div>
        <div class="form-actions">
          <div class="form-actions__left">
            <button data-action="save-campaign" class="btn btn-primary">${esc(this.t('adminSave'))}</button>
            <button data-action="cancel-campaign-form" class="btn btn-ghost">${esc(this.t('adminCancel'))}</button>
          </div>
          ${editingCampaign ? `<button data-action="delete-campaign" data-slug="${esc(editingCampaign.slug)}" class="btn btn-danger-ghost">${esc(this.t('adminDeleteCampaign'))}</button>` : ''}
        </div>
        ${editingCampaign ? this.renderCampaignFrames(editingCampaign) : `<div class="save-campaign-first-hint">${esc(this.t('saveThisCampaignFirst'))}</div>`}
      </div>` : '';

    return `
    <div class="admin-page-header">
      <div class="admin-page-header__title">${esc(this.t('adminCampaigns'))}</div>
      <button data-action="new-campaign" class="btn btn-primary btn-sm">${esc(this.t('adminNewCampaign'))}</button>
    </div>
    <div class="card admin-table-card">
      <table class="admin-table">
        <thead><tr>
          <th>${esc(this.t('colSlug'))}</th>
          <th>${esc(this.t('colTitle'))}</th>
          <th>${esc(this.t('colLang'))}</th>
          <th>${esc(this.t('colTime'))}</th>
          <th>${esc(this.t('colStatus'))}</th>
          <th>${esc(this.t('colTemplates'))}</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${form}`;
  }

  componentChips(tpl) {
    if (!tpl.components || !tpl.components.length) return `<span class="text-muted-italic">—</span>`;
    return tpl.components.map(key => `<span class="chip">${esc(componentLabel(key, this.lang))}</span>`).join('');
  }

  renderCampaignFrames(c) {
    const cards = c.templates.map(tp => {
      const media = tp.frameImageUrl
        ? `<div class="frame-card__media frame-card__media--image"><img src="${tp.frameImageUrl}" alt="" /></div>`
        : `<div class="frame-card__media" style="background:linear-gradient(155deg, color-mix(in srgb, ${esc(FRAME_COLORS[tp.id]||'#F5760A')} 24%, #eef1f5), #dfe6ee)">
             <div class="frame-card__ring" style="border-color:${esc(FRAME_COLORS[tp.id]||'#F5760A')}"></div>
           </div>`;
      return `
      <div class="card frame-card">
        ${media}
        <div class="frame-card__body">
          <div class="frame-card__name">${esc(tp.name)}</div>
          <div class="frame-card__chips">${this.componentChips(tp)}</div>
          <div class="frame-card__meta">x:${tp.photoArea.x}% y:${tp.photoArea.y}% ${tp.photoArea.w}×${tp.photoArea.h}%</div>
          <div class="frame-card__actions">
            <button data-action="edit-template" data-tpl="${esc(tp.id)}" data-slug="${esc(c.slug)}" class="btn btn-ghost btn-sm">${esc(this.t('adminEdit'))}</button>
            <button data-action="delete-template" data-tpl="${esc(tp.id)}" data-slug="${esc(c.slug)}" class="btn btn-danger-ghost btn-sm">${esc(this.t('adminDelete'))}</button>
          </div>
        </div>
      </div>`;
    }).join('');

    const form = this.state.templateFormOpen ? this.renderTemplateForm() : '';

    return `
    <div class="frames-section">
      <div class="frames-section__header">
        <div>
          <div class="frames-section__title">${esc(this.t('campaignFramesTitle'))}</div>
          <div class="frames-section__hint">${esc(this.t('campaignFramesHint'))}</div>
        </div>
        <button data-action="new-template" data-slug="${esc(c.slug)}" class="btn btn-primary btn-sm">${esc(this.t('adminNewTemplate'))}</button>
      </div>
      <div class="frames-grid">${cards || `<div class="text-muted-italic-sm">—</div>`}</div>
      ${form}
    </div>`;
  }

  renderTemplateForm() {
    const d = this.state.draftTemplate || {};
    const area = d.photoArea || { x:20, y:20, w:60, h:60 };
    const selected = new Set(d.components || []);
    const checks = COMPONENT_DEFS.map(def => `
      <label class="component-check">
        <input type="checkbox" data-comp-check="${def.key}" ${selected.has(def.key)?'checked':''} />
        ${esc(this.lang==='vi' ? def.label : def.labelEn)}
      </label>`).join('');

    return `
    <div class="card template-form-card">
      <div class="template-form-card__title">${esc(this.t('templateFormTitle'))}</div>
      <div class="field field--stacked"><label>${esc(this.t('fTplName'))}</label><input id="tf-name" type="text" value="${esc(d.name||'')}" /></div>
      <div class="field field--stacked">
        <label>${esc(this.t('fFrameUpload'))}</label>
        ${d.frameImageUrl ? `
          <div class="frame-upload-preview">
            <div class="frame-upload-preview__thumb"><img src="${d.frameImageUrl}" alt="" /></div>
            <button type="button" data-action="pick-frame-image" class="btn btn-ghost btn-sm">${esc(this.t('changeFrameImage'))}</button>
          </div>` : `
          <div data-action="pick-frame-image" class="upload-dropzone">
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--orange)" stroke-width="1.8" width="30" height="30" class="upload-dropzone__icon"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>
            <div class="upload-dropzone__title">${esc(this.t('dropTitle'))}</div>
            <div class="upload-dropzone__sub">${esc(this.t('dropSub'))}</div>
          </div>`}
        <input type="file" id="frame-image-input" accept="image/png" class="hidden" />
      </div>
      <div class="field field--stacked">
        <label>${esc(this.t('fPhotoArea'))}</label>
        <div class="area-inputs-grid">
          <input id="tf-x" type="number" placeholder="x" value="${area.x}" />
          <input id="tf-y" type="number" placeholder="y" value="${area.y}" />
          <input id="tf-w" type="number" placeholder="w" value="${area.w}" />
          <input id="tf-h" type="number" placeholder="h" value="${area.h}" />
        </div>
      </div>
      <div class="components-section">
        <div class="components-section__title">${esc(this.t('fComponents'))}</div>
        <div class="components-section__hint">${esc(this.t('fComponentsHint'))}</div>
        <div class="components-grid">${checks}</div>
      </div>
      <div class="template-form-actions">
        <button data-action="save-template" class="btn btn-primary">${esc(this.t('adminSave'))}</button>
        <button data-action="cancel-template-form" class="btn btn-ghost">${esc(this.t('adminCancel'))}</button>
      </div>
    </div>`;
  }

  /* ---------------- Analytics ---------------- */
  bar(name, value, max, color) {
    const pct = Math.round(value/max*100);
    return `<div>
      <div class="bar-row__header"><span class="bar-row__name">${esc(name)}</span><span class="bar-row__value tabular-nums">${fmtNum(value, this.lang)}</span></div>
      <div class="bar-track"><div class="bar-fill" style="background:${color};width:${pct}%"></div></div>
    </div>`;
  }

  renderAdminAnalytics() {
    const liveByCampaign = this.store.campaigns.map(c => ({ name: this.lang==='vi' ? c.title : c.titleEn, value: this.store.downloadCounts[c.slug] || 0 }))
      .sort((a,b) => b.value - a.value);
    const maxC = Math.max(1, ...liveByCampaign.map(x=>x.value));
    const maxU = Math.max(...analytics.byUnit.map(x=>x.value));
    const maxD = Math.max(...analytics.byDay.map(x=>x.value));
    const total = liveByCampaign.reduce((a,x)=>a+x.value,0);
    const activeCount = this.store.campaigns.filter(c=>campaignStatus(c)==='active').length;

    return `
    <div class="analytics-title">${esc(this.t('adminAnalytics'))}</div>
    <div id="admin-grid-3col">
      <div class="card kpi-card"><div class="kpi-card__label">${esc(this.t('kpiTotal'))}</div><div class="kpi-card__value tabular-nums">${fmtNum(total, this.lang)}</div></div>
      <div class="card kpi-card"><div class="kpi-card__label">${esc(this.t('kpiActive'))}</div><div class="kpi-card__value tabular-nums">${activeCount}</div></div>
      <div class="card kpi-card"><div class="kpi-card__label">${esc(this.t('kpiTop'))}</div><div class="kpi-card__value--sm">${esc(liveByCampaign[0]?.name || '—')}</div></div>
    </div>
    <div class="card chart-card"><div class="chart-card__title">${esc(this.t('byCampaign'))}</div>
      <div class="bar-stack">${liveByCampaign.map(x=>this.bar(x.name,x.value,maxC,'var(--orange)')).join('')}</div></div>
    <div class="card chart-card"><div class="chart-card__title">${esc(this.t('byUnit'))} <span class="chart-card__title-note">${esc(this.t('liveDataNote'))}</span></div>
      <div class="bar-stack">${analytics.byUnit.map(x=>this.bar(x.name,x.value,maxU,'var(--blue)')).join('')}</div></div>
    <div class="card chart-card"><div class="chart-card__title">${esc(this.t('byDay'))} <span class="chart-card__title-note">${esc(this.t('liveDataNote'))}</span></div>
      <div class="day-chart">
        ${analytics.byDay.map(x=>`<div class="day-chart__col">
          <div class="day-chart__bar" style="height:${Math.round(x.value/maxD*100)}%"></div>
          <div class="day-chart__label">${esc(x.day)}</div>
        </div>`).join('')}
      </div></div>
    <div class="note-box note-box--warn">
      ${esc(this.t('gaNote'))}<span class="mono">avatar_download</span>${esc(this.t('gaNote2'))}
    </div>`;
  }

  /* ---------------- Event handlers ---------------- */
  attachHandlers() {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', e => this.onAction(e));
    });
    const frameInput = document.getElementById('frame-image-input');
    if (frameInput) frameInput.addEventListener('change', e => this.handleFrameImageSelected(e));
  }

  // Reads the chosen PNG as a data URL — same approach the public site
  // already uses for the visitor's personal photo (no real upload backend
  // yet, see spec section 3.1). A rough size cap keeps a careless multi-MB
  // export from silently blowing past localStorage's quota once saved.
  handleFrameImageSelected(e) {
    const file = e.target.files[0];
    if (!file) return;
    const MAX_BYTES = 1.5 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      this.showToast(this.t('frameImageTooLarge'), 'error');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = ev => {
      this.state.draftTemplate.frameImageUrl = ev.target.result;
      this.render();
    };
    reader.readAsDataURL(file);
  }

  /* Registered once, in the capture phase so it runs before the bell's own
     toggle handler (bubble phase) — otherwise the click that opens the panel
     would immediately close it again after render() detaches the old target. */
  closeNotifOnOutsideClick(e) {
    if (!this.state.notifOpen) return;
    const wrap = document.getElementById('notif-wrap');
    if (wrap && !wrap.contains(e.target)) { this.state.notifOpen = false; this.render(); }
  }

  readCampaignForm() {
    return {
      slug: this.val('cf-slug'), language: this.val('cf-language'), startDate: this.val('cf-start'), endDate: this.val('cf-end'),
      status: this.val('cf-status'), badge: this.val('cf-badge'), title: this.val('cf-title'), titleEn: this.val('cf-titleEn'),
      description: this.val('cf-description'), descriptionEn: this.val('cf-descriptionEn'), cta: this.val('cf-cta'), ctaEn: this.val('cf-ctaEn'),
    };
  }
  readTemplateForm() {
    const components = Array.from(document.querySelectorAll('[data-comp-check]:checked')).map(el => el.dataset.compCheck);
    return {
      name: this.val('tf-name'),
      // frameImageUrl has no DOM input to read back — it's written directly
      // into state.draftTemplate by the file-input change handler, so it
      // must be carried forward here whenever the rest of the form is
      // re-read (e.g. switching tabs mid-edit).
      frameImageUrl: this.state.draftTemplate.frameImageUrl || null,
      photoArea: { x: this.numVal('tf-x'), y: this.numVal('tf-y'), w: this.numVal('tf-w'), h: this.numVal('tf-h') },
      components,
    };
  }
  val(id) { const el = document.getElementById(id); return el ? el.value : ''; }
  numVal(id) { return Number(this.val(id)) || 0; }

  onAction(e) {
    const el = e.currentTarget;
    const action = el.dataset.action;

    if (this.state.campaignFormOpen && ['admin-tab','new-campaign','edit-campaign','cycle-status'].includes(action)) {
      this.state.draftCampaign = this.readCampaignForm();
    }
    if (this.state.templateFormOpen && ['admin-tab','new-campaign','edit-campaign','cancel-campaign-form','save-campaign','new-template','edit-template','delete-template'].includes(action)) {
      this.state.draftTemplate = this.readTemplateForm();
    }

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
        case 'admin-tab': this.state.adminTab = el.dataset.tab; this.state.campaignFormOpen = false; this.state.templateFormOpen = false; this.render(); break;
        case 'new-campaign': this.state.campaignFormOpen = true; this.state.editingCampaignSlug = null; this.state.draftCampaign = { language:'vi', status:'draft' }; this.state.templateFormOpen = false; this.render(); break;
        case 'edit-campaign': {
          const c = this.store.findCampaign(el.dataset.slug);
          this.state.campaignFormOpen = true; this.state.editingCampaignSlug = c.slug; this.state.draftCampaign = { ...c }; this.state.templateFormOpen = false; this.render();
          break;
        }
        case 'cancel-campaign-form': this.state.campaignFormOpen = false; this.state.templateFormOpen = false; this.render(); break;
        case 'save-campaign': this.handleSaveCampaign(); break;
        case 'delete-campaign': this.handleDeleteCampaign(el); break;
        case 'cycle-status': {
          this.store.cycleCampaignStatus(el.dataset.slug);
          this.showToast(this.t('statusChanged'));
          this.render();
          break;
        }
        case 'new-template': {
          this.state.templateFormOpen = true; this.state.editingTemplateId = null;
          this.state.draftTemplate = { photoArea:{x:20,y:20,w:60,h:60}, components: [] };
          this.render();
          break;
        }
        case 'edit-template': {
          const c = this.store.findCampaign(el.dataset.slug);
          const tpl = c.templates.find(x => x.id === el.dataset.tpl);
          this.state.templateFormOpen = true; this.state.editingTemplateId = tpl.id; this.state.draftTemplate = { ...tpl }; this.render();
          break;
        }
        case 'delete-template': {
          if (!confirm(this.t('confirmDeleteTemplate'))) break;
          this.store.deleteTemplate(el.dataset.slug, el.dataset.tpl);
          this.showToast(this.t('templateDeleted'));
          this.render();
          break;
        }
        case 'cancel-template-form': this.state.templateFormOpen = false; this.render(); break;
        case 'save-template': this.handleSaveTemplate(); break;
        case 'pick-frame-image': document.getElementById('frame-image-input')?.click(); break;
      }
    } catch (err) {
      console.error(err);
      this.showToast(this.t('errorGeneric'), 'error');
    }
  }

  // Every failure branch below does the same three things, in this order:
  // (1) write the just-read form values back into state.draftCampaign so
  // the re-render doesn't blank out what the admin typed, (2) render() now
  // so the error toast actually paints immediately instead of waiting for
  // its own 3.2s auto-dismiss timer to force a render later (by which point
  // it would also wipe the form, since draftCampaign was still stale), and
  // (3) markInvalid() *after* render(), because render() replaces the DOM
  // nodes — calling markInvalid on the pre-render nodes would highlight
  // elements no longer on the page.
  handleSaveCampaign() {
    const d = this.readCampaignForm();
    if (!d.slug.trim() || !d.title.trim()) {
      this.state.draftCampaign = d;
      this.showToast(this.t('validationRequired'), 'error');
      this.render();
      this.markInvalid('cf-slug', !d.slug.trim());
      this.markInvalid('cf-title', !d.title.trim());
      return;
    }
    // slug ends up in the public URL (/c/[slug]) and as a raw HTML attribute
    // value elsewhere in this app — lowercase kebab-case only, same rule the
    // backend plan already commits to, so a typo here can't produce a slug
    // that breaks routing or silently fails to match anywhere else.
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(d.slug.trim())) {
      this.state.draftCampaign = d;
      this.showToast(this.t('validationSlugFormat'), 'error');
      this.render();
      this.markInvalid('cf-slug', true);
      return;
    }
    const slugTaken = this.store.campaigns.some(x => x.slug === d.slug && x.slug !== this.state.editingCampaignSlug);
    if (slugTaken) {
      this.state.draftCampaign = d;
      this.showToast(this.t('validationRequired'), 'error');
      this.render();
      this.markInvalid('cf-slug', true);
      return;
    }
    // Nothing else in the form catches an inverted date range, and
    // campaignStatus() silently derives 'closed' for it (today is always
    // past an end date that's before the start date) — the admin sees
    // "Đang chạy" while the public site shows the campaign as ended. See
    // conversation: reproduced with startDate=2026-08-10, endDate=2026-08-04.
    if (d.startDate && d.endDate && d.endDate < d.startDate) {
      this.state.draftCampaign = d;
      this.showToast(this.t('validationDateOrder'), 'error');
      this.render();
      this.markInvalid('cf-start', true);
      this.markInvalid('cf-end', true);
      return;
    }
    const isNew = this.store.saveCampaign(d, this.state.editingCampaignSlug);
    this.store.addNotification(
      isNew ? `Đã tạo campaign mới "${d.title}".` : `Đã cập nhật campaign "${d.title}".`,
      isNew ? `New campaign "${d.title}" created.` : `Campaign "${d.title}" updated.`,
      isNew ? 'campaign-create' : 'campaign-update'
    );
    this.showToast(this.t('savedToast'));
    // keep editing the same campaign open so admins can add frames right away
    this.state.editingCampaignSlug = d.slug;
    this.state.draftCampaign = { ...this.store.findCampaign(d.slug) };
    this.render();
  }

  handleDeleteCampaign(el) {
    const c = this.store.findCampaign(el.dataset.slug);
    if (!c) return;
    if (!confirm(this.t('confirmDeleteCampaign'))) return;
    this.store.deleteCampaign(c.slug);
    this.store.addNotification(`Đã xoá campaign "${c.title}".`, `Campaign "${c.title}" deleted.`, 'campaign-delete');
    this.state.campaignFormOpen = false; this.state.editingCampaignSlug = null; this.state.templateFormOpen = false;
    this.showToast(this.t('campaignDeletedToast'));
    this.render();
  }

  handleSaveTemplate() {
    const d = this.readTemplateForm();
    if (!d.name.trim()) {
      this.state.draftTemplate = d;
      this.showToast(this.t('validationRequired'), 'error');
      this.render();
      this.markInvalid('tf-name', true);
      return;
    }
    this.store.saveTemplate(this.state.editingCampaignSlug, d, this.state.editingTemplateId);
    this.state.templateFormOpen = false;
    this.showToast(this.t('savedToast'));
    this.render();
  }

  markInvalid(id, invalid) {
    const el = document.getElementById(id);
    if (!el) return;
    if (invalid) { el.style.borderColor = '#D6402F'; el.classList.add('shake-error'); setTimeout(() => el.classList.remove('shake-error'), 500); }
    else { el.style.borderColor = ''; }
  }

  showToast(msg, type) {
    this.toast.show(msg, type, () => this.render());
  }
}
