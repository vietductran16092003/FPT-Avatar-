/* ============================================================
   Static configuration: frame colors, storage key and the
   reusable Step-3 component registry.
   ============================================================ */

export const FRAME_COLORS = { 'fpt38-orange':'#F5760A', 'fpt38-mono':'#101E2E', 'tw-blue':'#0068B4', 'tw-dynamic':'#00A651' };
export const STORAGE_KEY = 'afp_platform_v2';
// Separate key (not nested in STORAGE_KEY's campaign/notification blob) so the
// language choice survives independently and is shared by both index.html and
// admin.html — switching to EN on one page must stay EN after navigating to
// the other, not silently reset to the I18n class's 'vi' default.
export const LANG_STORAGE_KEY = 'afp_lang';

/* ---- Reusable Step-3 component registry ----
   Admins tick which of these apply to a given frame; end users only see
   the ticked ones. Each definition already carries its own label/options,
   so nothing needs to be retyped per template. */
class ComponentRegistry {
  constructor(defs) {
    this.defs = defs;
  }
  get(key) {
    return this.defs.find(d => d.key === key);
  }
  label(key, lang) {
    const d = this.get(key);
    return d ? (lang === 'vi' ? d.label : d.labelEn) : key;
  }
}

export const COMPONENT_DEFS = [
  { key: 'joinYear', type: 'select', label: 'Năm gia nhập FPT', labelEn: 'Year joined FPT',
    getOptions: () => Array.from({ length: new Date().getFullYear() - 1988 + 1 }, (_, i) => String(new Date().getFullYear() - i)) },
  { key: 'unit', type: 'select', label: 'Đơn vị công tác', labelEn: 'Business unit',
    getOptions: () => ['FPT Software', 'FPT Telecom', 'FPT IS', 'FPT Education', 'FPT Retail', 'Khác'] },
  { key: 'slogan', type: 'text', label: 'Câu châm ngôn', labelEn: 'Personal slogan',
    placeholder: 'VD: Dream Big, Move Fast', placeholderEn: 'e.g. Dream Big, Move Fast' },
  { key: 'signature', type: 'text', label: 'Chữ ký / Tên hiển thị', labelEn: 'Display name / signature',
    placeholder: 'VD: Nguyễn Văn A', placeholderEn: 'e.g. John Doe' },
];

export const componentRegistry = new ComponentRegistry(COMPONENT_DEFS);
export function getComponentDef(key) { return componentRegistry.get(key); }
export function componentLabel(key, lang) { return componentRegistry.label(key, lang); }

export const statusMeta = { active: 'pill-live', draft: 'pill-draft', archived: 'pill-archived' };
