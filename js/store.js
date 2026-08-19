/* ============================================================
   AppStore — owns campaigns / downloadCounts / notifications /
   analytics and bridges edits between index.html (public) and
   admin.html via localStorage (no real backend yet).
   ============================================================ */
import { STORAGE_KEY } from './constants.js';

const NOTIF_MAX = 50;

const DEFAULT_CAMPAIGNS = [
  {
    slug: 'fpt38', status: 'active', startDate: '2026-08-13', endDate: '2026-09-13',
    title: 'FPT tròn 38 tuổi', titleEn: 'FPT Turns 38',
    description: 'Tạo avatar kỷ niệm hành trình 38 năm và chia sẻ lên mạng xã hội của bạn.',
    descriptionEn: 'Create your anniversary avatar and share it on social media.',
    cta: 'Tạo avatar ngay', ctaEn: 'Create your avatar', badge: '38', language: 'vi',
    templates: [
      { id: 'fpt38-orange', name: 'Khung cam chuẩn', photoArea: { x: 18, y: 14, w: 64, h: 64 }, components: ['joinYear', 'slogan'] },
      { id: 'fpt38-mono', name: 'Khung tối giản đen', photoArea: { x: 20, y: 16, w: 60, h: 60 }, components: ['joinYear'] },
    ],
  },
  {
    slug: 'techweek-2026', status: 'active', startDate: '2026-08-20', endDate: '2026-08-28',
    title: 'Ngày hội Công nghệ FPT 2026', titleEn: 'FPT Tech Week 2026',
    description: 'Ghép avatar cùng khung Tech Week và cho biết đơn vị bạn đang công tác.',
    descriptionEn: 'Make your Tech Week avatar and show which unit you belong to.',
    cta: 'Tạo avatar ngay', ctaEn: 'Create your avatar', badge: 'Tech Week', language: 'vi',
    templates: [
      { id: 'tw-blue', name: 'Khung công nghệ xanh dương', photoArea: { x: 16, y: 18, w: 68, h: 68 }, components: ['unit', 'signature'] },
      { id: 'tw-dynamic', name: 'Khung năng động xanh lá', photoArea: { x: 18, y: 18, w: 64, h: 64 }, components: ['unit'] },
    ],
  },
];

const DEFAULT_DOWNLOAD_COUNTS = { fpt38: 12482, 'techweek-2026': 3190 };

export const analytics = {
  byCampaign: [ { name: 'FPT tròn 38 tuổi', value: 18420 }, { name: 'Ngày hội Công nghệ FPT 2026', value: 6310 } ],
  byUnit: [
    { name: 'FPT Software', value: 9100 }, { name: 'FPT Telecom', value: 4200 }, { name: 'FPT IS', value: 3800 },
    { name: 'FPT Education', value: 2600 }, { name: 'FPT Retail', value: 1900 }, { name: 'Khác', value: 2130 },
  ],
  byDay: [
    { day: 'T2', value: 1180 }, { day: 'T3', value: 1540 }, { day: 'T4', value: 2010 }, { day: 'T5', value: 2960 },
    { day: 'T6', value: 4120 }, { day: 'T7', value: 3870 }, { day: 'CN', value: 3040 },
  ],
};

export class AppStore {
  constructor() {
    this.campaigns = DEFAULT_CAMPAIGNS.slice();
    this.downloadCounts = { ...DEFAULT_DOWNLOAD_COUNTS };
    this.notifications = [];
  }

  /* ---- persistence bridge ---- */
  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data.campaigns) && data.campaigns.length) {
        this.campaigns.length = 0;
        this.campaigns.push(...data.campaigns);
      }
      if (data.downloadCounts) Object.assign(this.downloadCounts, data.downloadCounts);
      if (Array.isArray(data.notifications)) { this.notifications.length = 0; this.notifications.push(...data.notifications); }
    } catch (e) { /* ignore corrupt storage */ }
  }
  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        campaigns: this.campaigns, downloadCounts: this.downloadCounts, notifications: this.notifications,
      }));
    } catch (e) { /* storage unavailable */ }
  }

  /* ---- campaigns ---- */
  findCampaign(slug) {
    return this.campaigns.find(x => x.slug === slug);
  }
  saveCampaign(draft, editingSlug) {
    const isNew = !editingSlug;
    if (!isNew) {
      const idx = this.campaigns.findIndex(x => x.slug === editingSlug);
      this.campaigns[idx] = { ...this.campaigns[idx], ...draft };
    } else {
      this.campaigns.push({
        slug: draft.slug, status: draft.status || 'draft',
        startDate: draft.startDate || '2026-01-01', endDate: draft.endDate || '2026-12-31',
        title: draft.title, titleEn: draft.titleEn || draft.title,
        description: draft.description || '', descriptionEn: draft.descriptionEn || '',
        cta: draft.cta || 'Tạo avatar ngay', ctaEn: draft.ctaEn || 'Create your avatar', badge: draft.badge || 'NEW',
        language: draft.language || 'vi', templates: [],
      });
    }
    return isNew;
  }
  deleteCampaign(slug) {
    const c = this.findCampaign(slug);
    if (!c) return null;
    this.campaigns.splice(this.campaigns.indexOf(c), 1);
    delete this.downloadCounts[slug];
    return c;
  }
  cycleCampaignStatus(slug) {
    const order = ['draft', 'active', 'archived'];
    const c = this.findCampaign(slug);
    c.status = order[(order.indexOf(c.status) + 1) % order.length];
    this.save();
    return c;
  }
  recordDownload(slug) {
    this.downloadCounts[slug] = (this.downloadCounts[slug] || 0) + 1;
  }

  /* ---- templates (frames), nested inside a campaign ---- */
  saveTemplate(campaignSlug, draft, editingTemplateId) {
    const c = this.findCampaign(campaignSlug);
    const newTpl = {
      id: editingTemplateId || (c.slug + '-' + Date.now()),
      name: draft.name, photoArea: draft.photoArea, components: draft.components,
    };
    const idx = c.templates.findIndex(x => x.id === editingTemplateId);
    if (idx >= 0) c.templates[idx] = newTpl; else c.templates.push(newTpl);
    this.save();
    return newTpl;
  }
  deleteTemplate(campaignSlug, templateId) {
    const c = this.findCampaign(campaignSlug);
    c.templates = c.templates.filter(x => x.id !== templateId);
    this.save();
  }

  /* ---- notifications ---- */
  addNotification(vi, en, type) {
    this.notifications.unshift({ id: Date.now() + '-' + Math.random().toString(36).slice(2, 7), vi, en, type: type || 'info', ts: Date.now(), read: false });
    if (this.notifications.length > NOTIF_MAX) this.notifications.length = NOTIF_MAX;
    this.save();
  }
  unreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }
  markAllRead() {
    this.notifications.forEach(n => n.read = true);
    this.save();
  }
}
