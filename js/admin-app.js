/* ============================================================
   AdminApp — admin console. Frames live nested inside the
   campaign they belong to, and each frame's Step-3 fields are
   ticked from a shared component registry. Public site lives in
   PublicApp; both share AppStore/I18n and bridge edits via
   localStorage.
   ============================================================ */
import { I18n } from './i18n.js';
import { FRAME_COLORS, COMPONENT_DEFS, componentLabel, statusMeta } from './constants.js';
import { esc, fmtNum, campaignStatus } from './utils.js';
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
    <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 28px;border-bottom:1px solid var(--border);background:var(--surface);flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:10px">
        <div class="brand-mark" style="width:50px;height:32px;border-radius:8px;padding:4px"><img src="assets/fpt-logo.webp" alt="FPT" /></div>
        <div style="font-weight:700;font-size:15px">Avatar Frame Platform <span style="color:var(--ink-soft);font-weight:500">· Admin</span></div>
      </div>
      <div style="display:flex;align-items:center;gap:14px">
        ${this.langToggle()}
        <a href="index.html">${esc(this.t('adminExit'))}</a>
        ${this.bell.render(this.lang, this.state.notifOpen)}
        <div style="width:30px;height:30px;border-radius:999px;background:#FDE6D2;color:var(--orange-deep);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px">VĐ</div>
      </div>
    </div>`;
  }

  /* ---------------- Admin shell ---------------- */
  navItem(id, label) {
    const active = this.state.adminTab === id;
    return `<div data-action="admin-tab" data-tab="${id}" style="display:flex;align-items:center;padding:10px 14px;border-radius:10px;font-weight:${active?700:600};font-size:13.5px;cursor:pointer;background:${active?'#FDE9D6':'transparent'};color:${active?'var(--orange-deep)':'var(--ink-soft)'}">${esc(label)}</div>`;
  }

  renderAdmin() {
    return `
    <div id="admin-shell" style="display:grid;grid-template-columns:220px 1fr;max-width:1240px;margin:0 auto">
      <div style="padding:24px 16px;display:flex;flex-direction:column;gap:4px;border-right:1px solid var(--border);min-height:calc(100vh - 65px)">
        ${this.navItem('campaigns', this.t('adminCampaigns'))}
        ${this.navItem('analytics', this.t('adminAnalytics'))}
      </div>
      <div id="admin-main" style="padding:28px 32px;min-width:0">
        ${this.state.adminTab === 'campaigns' ? this.renderAdminCampaigns() : ''}
        ${this.state.adminTab === 'analytics' ? this.renderAdminAnalytics() : ''}
      </div>
    </div>`;
  }

  /* ---------------- Campaigns (+ nested frames) ---------------- */
  renderAdminCampaigns() {
    const rows = this.store.campaigns.map(c => `
      <tr style="border-top:1px solid var(--border)">
        <td style="padding:12px 16px;font-family:ui-monospace,monospace;font-size:12.5px;color:var(--ink-soft)">/c/${esc(c.slug)}</td>
        <td style="padding:12px 16px;font-weight:600">${esc(c.title)}</td>
        <td style="padding:12px 16px">${esc(c.language.toUpperCase())}</td>
        <td style="padding:12px 16px;color:var(--ink-soft);font-variant-numeric:tabular-nums">${esc(c.startDate)} – ${esc(c.endDate)}</td>
        <td style="padding:12px 16px"><span data-action="cycle-status" data-slug="${esc(c.slug)}" class="pill ${statusMeta[c.status]}" style="cursor:pointer">${esc(this.t('statusOpt'+c.status[0].toUpperCase()+c.status.slice(1)))}</span></td>
        <td style="padding:12px 16px;color:var(--ink-soft)">${c.templates.length}</td>
        <td style="padding:12px 16px;text-align:right"><button data-action="edit-campaign" data-slug="${esc(c.slug)}" class="btn btn-ghost btn-sm">${esc(this.t('adminEdit'))}</button></td>
      </tr>`).join('');

    const d = this.state.draftCampaign || {};
    const editingCampaign = this.state.editingCampaignSlug ? this.store.findCampaign(this.state.editingCampaignSlug) : null;

    const form = this.state.campaignFormOpen ? `
      <div class="card" style="padding:24px;max-width:760px">
        <div style="font-size:15px;font-weight:700;margin-bottom:18px">${esc(this.t('campaignFormTitle'))}</div>
        <div class="admin-grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
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
        <div class="admin-grid-2col" style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
          <div class="field"><label>${esc(this.t('fTitle'))}</label><input id="cf-title" type="text" value="${esc(d.title||'')}" /></div>
          <div class="field"><label>${esc(this.t('fTitleEn'))}</label><input id="cf-titleEn" type="text" value="${esc(d.titleEn||'')}" /></div>
          <div class="field"><label>${esc(this.t('fDesc'))}</label><textarea id="cf-description">${esc(d.description||'')}</textarea></div>
          <div class="field"><label>${esc(this.t('fDescEn'))}</label><textarea id="cf-descriptionEn">${esc(d.descriptionEn||'')}</textarea></div>
          <div class="field"><label>${esc(this.t('fCta'))}</label><input id="cf-cta" type="text" value="${esc(d.cta||'')}" /></div>
          <div class="field"><label>${esc(this.t('fCtaEn'))}</label><input id="cf-ctaEn" type="text" value="${esc(d.ctaEn||'')}" /></div>
        </div>
        <div style="background:#EAF2FB;border:1px solid #CFE2F4;border-radius:10px;padding:12px 14px;font-size:12px;line-height:1.5;color:var(--blue-deep);margin-bottom:18px">${esc(this.t('bilingualNote'))}</div>
        <div style="display:flex;gap:10px;justify-content:space-between;flex-wrap:wrap">
          <div style="display:flex;gap:10px">
            <button data-action="save-campaign" class="btn btn-primary">${esc(this.t('adminSave'))}</button>
            <button data-action="cancel-campaign-form" class="btn btn-ghost">${esc(this.t('adminCancel'))}</button>
          </div>
          ${editingCampaign ? `<button data-action="delete-campaign" data-slug="${esc(editingCampaign.slug)}" class="btn btn-danger-ghost">${esc(this.t('adminDeleteCampaign'))}</button>` : ''}
        </div>
        ${editingCampaign ? this.renderCampaignFrames(editingCampaign) : `<div style="margin-top:18px;font-size:12.5px;color:var(--ink-soft);font-style:italic">${esc(this.t('saveThisCampaignFirst'))}</div>`}
      </div>` : '';

    return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;flex-wrap:wrap;gap:10px">
      <div style="font-size:20px;font-weight:800">${esc(this.t('adminCampaigns'))}</div>
      <button data-action="new-campaign" class="btn btn-primary btn-sm">${esc(this.t('adminNewCampaign'))}</button>
    </div>
    <div class="card" style="overflow:auto;margin-bottom:24px">
      <table style="width:100%;border-collapse:collapse;font-size:13.5px;min-width:720px">
        <thead><tr style="background:var(--muted-bg);text-align:left">
          <th style="padding:12px 16px;font-weight:700;color:var(--ink-soft);font-size:11px;text-transform:uppercase;letter-spacing:.03em">${esc(this.t('colSlug'))}</th>
          <th style="padding:12px 16px;font-weight:700;color:var(--ink-soft);font-size:11px;text-transform:uppercase;letter-spacing:.03em">${esc(this.t('colTitle'))}</th>
          <th style="padding:12px 16px;font-weight:700;color:var(--ink-soft);font-size:11px;text-transform:uppercase;letter-spacing:.03em">${esc(this.t('colLang'))}</th>
          <th style="padding:12px 16px;font-weight:700;color:var(--ink-soft);font-size:11px;text-transform:uppercase;letter-spacing:.03em">${esc(this.t('colTime'))}</th>
          <th style="padding:12px 16px;font-weight:700;color:var(--ink-soft);font-size:11px;text-transform:uppercase;letter-spacing:.03em">${esc(this.t('colStatus'))}</th>
          <th style="padding:12px 16px;font-weight:700;color:var(--ink-soft);font-size:11px;text-transform:uppercase;letter-spacing:.03em">${esc(this.t('colTemplates'))}</th>
          <th></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    ${form}`;
  }

  componentChips(tpl) {
    if (!tpl.components || !tpl.components.length) return `<span style="color:var(--ink-soft);font-style:italic">—</span>`;
    return tpl.components.map(key => `<span style="display:inline-block;background:var(--muted-bg);color:var(--ink-soft);font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin:0 4px 4px 0">${esc(componentLabel(key, this.lang))}</span>`).join('');
  }

  renderCampaignFrames(c) {
    const cards = c.templates.map(tp => `
      <div class="card" style="overflow:hidden">
        <div style="aspect-ratio:1/1;background:linear-gradient(155deg, color-mix(in srgb, ${esc(FRAME_COLORS[tp.id]||'#F5760A')} 24%, #eef1f5), #dfe6ee);position:relative">
          <div style="position:absolute;inset:8%;border-radius:10px;border:7px solid ${esc(FRAME_COLORS[tp.id]||'#F5760A')};box-shadow:inset 0 0 0 2px #fff"></div>
        </div>
        <div style="padding:14px">
          <div style="font-weight:700;font-size:14px;margin-bottom:6px">${esc(tp.name)}</div>
          <div style="margin-bottom:10px;line-height:1.9">${this.componentChips(tp)}</div>
          <div style="font-size:11px;color:var(--ink-soft);margin-bottom:12px;font-family:ui-monospace,monospace">x:${tp.photoArea.x}% y:${tp.photoArea.y}% ${tp.photoArea.w}×${tp.photoArea.h}%</div>
          <div style="display:flex;gap:8px">
            <button data-action="edit-template" data-tpl="${esc(tp.id)}" data-slug="${esc(c.slug)}" class="btn btn-ghost btn-sm" style="flex:1">${esc(this.t('adminEdit'))}</button>
            <button data-action="delete-template" data-tpl="${esc(tp.id)}" data-slug="${esc(c.slug)}" class="btn btn-danger-ghost btn-sm">${esc(this.t('adminDelete'))}</button>
          </div>
        </div>
      </div>`).join('');

    const form = this.state.templateFormOpen ? this.renderTemplateForm() : '';

    return `
    <div style="border-top:1px solid var(--border);margin-top:22px;padding-top:20px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;flex-wrap:wrap;gap:10px">
        <div>
          <div style="font-size:15px;font-weight:700">${esc(this.t('campaignFramesTitle'))}</div>
          <div style="font-size:12px;color:var(--ink-soft)">${esc(this.t('campaignFramesHint'))}</div>
        </div>
        <button data-action="new-template" data-slug="${esc(c.slug)}" class="btn btn-primary btn-sm">${esc(this.t('adminNewTemplate'))}</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin:16px 0">${cards || `<div style="color:var(--ink-soft);font-size:12.5px;font-style:italic">—</div>`}</div>
      ${form}
    </div>`;
  }

  renderTemplateForm() {
    const d = this.state.draftTemplate || {};
    const area = d.photoArea || { x:20, y:20, w:60, h:60 };
    const selected = new Set(d.components || []);
    const checks = COMPONENT_DEFS.map(def => `
      <label style="display:flex;align-items:center;gap:8px;padding:9px 12px;border:1px solid var(--border-strong);border-radius:9px;cursor:pointer;font-size:13px;font-weight:600;background:var(--surface)">
        <input type="checkbox" data-comp-check="${def.key}" ${selected.has(def.key)?'checked':''} style="width:16px;height:16px;accent-color:var(--orange);flex-shrink:0" />
        ${esc(this.lang==='vi' ? def.label : def.labelEn)}
      </label>`).join('');

    return `
    <div class="card" style="padding:22px;margin-top:4px">
      <div style="font-size:14px;font-weight:700;margin-bottom:16px">${esc(this.t('templateFormTitle'))}</div>
      <div class="field" style="margin-bottom:14px"><label>${esc(this.t('fTplName'))}</label><input id="tf-name" type="text" value="${esc(d.name||'')}" /></div>
      <div class="field" style="margin-bottom:14px">
        <label>${esc(this.t('fFrameUpload'))}</label>
        <div style="width:110px;height:110px;border:1.5px dashed var(--border-strong);border-radius:10px;display:flex;align-items:center;justify-content:center;color:var(--ink-soft);font-size:11px;text-align:center;padding:8px">PNG frame overlay (demo)</div>
      </div>
      <div class="field" style="margin-bottom:14px">
        <label>${esc(this.t('fPhotoArea'))}</label>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px">
          <input id="tf-x" type="number" placeholder="x" value="${area.x}" />
          <input id="tf-y" type="number" placeholder="y" value="${area.y}" />
          <input id="tf-w" type="number" placeholder="w" value="${area.w}" />
          <input id="tf-h" type="number" placeholder="h" value="${area.h}" />
        </div>
      </div>
      <div style="border-top:1px solid var(--border);margin:18px 0;padding-top:16px">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">${esc(this.t('fComponents'))}</div>
        <div style="font-size:12px;color:var(--ink-soft);margin-bottom:12px">${esc(this.t('fComponentsHint'))}</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:8px">${checks}</div>
      </div>
      <div style="display:flex;gap:10px;margin-top:18px">
        <button data-action="save-template" class="btn btn-primary">${esc(this.t('adminSave'))}</button>
        <button data-action="cancel-template-form" class="btn btn-ghost">${esc(this.t('adminCancel'))}</button>
      </div>
    </div>`;
  }

  /* ---------------- Analytics ---------------- */
  bar(name, value, max, color) {
    const pct = Math.round(value/max*100);
    return `<div>
      <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px"><span style="font-weight:600">${esc(name)}</span><span style="color:var(--ink-soft);font-variant-numeric:tabular-nums">${fmtNum(value, this.lang)}</span></div>
      <div style="background:var(--muted-bg);border-radius:6px;height:10px;overflow:hidden"><div style="height:100%;background:${color};border-radius:6px;width:${pct}%"></div></div>
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
    <div style="font-size:20px;font-weight:800;margin-bottom:20px">${esc(this.t('adminAnalytics'))}</div>
    <div id="admin-grid-3col" style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:28px">
      <div class="card" style="padding:20px"><div style="font-size:12.5px;color:var(--ink-soft);font-weight:600;margin-bottom:6px">${esc(this.t('kpiTotal'))}</div><div style="font-size:28px;font-weight:800;font-variant-numeric:tabular-nums">${fmtNum(total, this.lang)}</div></div>
      <div class="card" style="padding:20px"><div style="font-size:12.5px;color:var(--ink-soft);font-weight:600;margin-bottom:6px">${esc(this.t('kpiActive'))}</div><div style="font-size:28px;font-weight:800;font-variant-numeric:tabular-nums">${activeCount}</div></div>
      <div class="card" style="padding:20px"><div style="font-size:12.5px;color:var(--ink-soft);font-weight:600;margin-bottom:6px">${esc(this.t('kpiTop'))}</div><div style="font-size:17px;font-weight:700;margin-top:6px">${esc(liveByCampaign[0]?.name || '—')}</div></div>
    </div>
    <div class="card" style="padding:22px;margin-bottom:20px"><div style="font-size:14px;font-weight:700;margin-bottom:16px">${esc(this.t('byCampaign'))}</div>
      <div style="display:flex;flex-direction:column;gap:12px">${liveByCampaign.map(x=>this.bar(x.name,x.value,maxC,'var(--orange)')).join('')}</div></div>
    <div class="card" style="padding:22px;margin-bottom:20px"><div style="font-size:14px;font-weight:700;margin-bottom:16px">${esc(this.t('byUnit'))} <span style="font-weight:400;color:var(--ink-soft);font-size:12px">${esc(this.t('liveDataNote'))}</span></div>
      <div style="display:flex;flex-direction:column;gap:12px">${analytics.byUnit.map(x=>this.bar(x.name,x.value,maxU,'var(--blue)')).join('')}</div></div>
    <div class="card" style="padding:22px;margin-bottom:20px"><div style="font-size:14px;font-weight:700;margin-bottom:16px">${esc(this.t('byDay'))} <span style="font-weight:400;color:var(--ink-soft);font-size:12px">${esc(this.t('liveDataNote'))}</span></div>
      <div style="display:flex;align-items:flex-end;gap:10px;height:120px">
        ${analytics.byDay.map(x=>`<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end">
          <div style="width:100%;background:var(--green);border-radius:6px 6px 0 0;height:${Math.round(x.value/maxD*100)}%"></div>
          <div style="font-size:11px;color:var(--ink-soft)">${esc(x.day)}</div>
        </div>`).join('')}
      </div></div>
    <div style="background:var(--warn-bg);border:1px solid #F5D9A8;border-radius:12px;padding:14px 16px;font-size:12.5px;line-height:1.5;color:var(--warn-fg)">
      ${esc(this.t('gaNote'))}<span style="font-family:ui-monospace,monospace">avatar_download</span>${esc(this.t('gaNote2'))}
    </div>`;
  }

  /* ---------------- Event handlers ---------------- */
  attachHandlers() {
    document.querySelectorAll('[data-action]').forEach(el => {
      el.addEventListener('click', e => this.onAction(e));
    });
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
      }
    } catch (err) {
      console.error(err);
      this.showToast(this.t('errorGeneric'), 'error');
    }
  }

  handleSaveCampaign() {
    const d = this.readCampaignForm();
    if (!d.slug.trim() || !d.title.trim()) {
      this.showToast(this.t('validationRequired'), 'error');
      this.markInvalid('cf-slug', !d.slug.trim());
      this.markInvalid('cf-title', !d.title.trim());
      return;
    }
    const slugTaken = this.store.campaigns.some(x => x.slug === d.slug && x.slug !== this.state.editingCampaignSlug);
    if (slugTaken) {
      this.showToast(this.t('validationRequired'), 'error');
      this.markInvalid('cf-slug', true);
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
      this.showToast(this.t('validationRequired'), 'error');
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
