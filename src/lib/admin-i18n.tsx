"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const ADMIN_LANG_STORAGE_KEY = "afp_admin_lang";

const ADMIN_DICT = {
  vi: {
    adminCampaigns: "Campaign",
    adminAnalytics: "Thống kê",
    adminLogout: "Đăng xuất",
    adminNewCampaign: "+ Campaign mới",
    adminEdit: "Sửa",
    adminDelete: "Xóa",
    adminCancel: "Đóng",
    colSlug: "Slug",
    colTitle: "Tiêu đề",
    colLang: "Ngôn ngữ",
    colTime: "Thời gian",
    colStatus: "Trạng thái",
    colTemplates: "Số khung",
    campaignFormTitle: "Thông tin Campaign",
    statusOptDraft: "Nháp",
    statusOptActive: "Hoạt động",
    statusOptArchived: "Lưu trữ",
    adminNewTemplate: "+ Khung mới",
    templateFormTitle: "Cấu hình khung ảnh",
    fTplName: "Tên khung",
    fFrameUpload: "Ảnh khung (PNG)",
    fPhotoArea: "Vùng ảnh cá nhân (%)",
    templateSave: "Lưu khung",
    templateUpdate: "Cập nhật khung",
    templateDelete: "Xóa khung",
    campaignFramesTitle: "Khung ảnh của Campaign này",
    campaignFramesHint: "Quản lý khung ảnh ngay tại đây — không cần chuyển trang.",
    saveThisCampaignFirst: "Lưu Campaign này trước để bắt đầu thêm khung ảnh.",
    fQuickAdd: "Thêm nhanh trường phổ biến",
    kpiTotal: "Tổng lượt tải",
    kpiActive: "Campaign đang chạy",
    kpiTop: "Campaign nhiều lượt tải nhất",
    byCampaign: "Lượt tải theo Campaign",
    byUnit: "Lượt tải theo đơn vị",
    byDay: "Lượt tải theo ngày (7 ngày gần nhất)",
    liveDataNote: "(số liệu minh hoạ — chưa kết nối dữ liệu thật)",
  },
  en: {
    adminCampaigns: "Campaigns",
    adminAnalytics: "Analytics",
    adminLogout: "Log out",
    adminNewCampaign: "+ New campaign",
    adminEdit: "Edit",
    adminDelete: "Delete",
    adminCancel: "Close",
    colSlug: "Slug",
    colTitle: "Title",
    colLang: "Language",
    colTime: "Schedule",
    colStatus: "Status",
    colTemplates: "Frames",
    campaignFormTitle: "Campaign details",
    statusOptDraft: "Draft",
    statusOptActive: "Active",
    statusOptArchived: "Archived",
    adminNewTemplate: "+ Add frame",
    templateFormTitle: "Frame configuration",
    fTplName: "Frame name",
    fFrameUpload: "Frame image (PNG)",
    fPhotoArea: "Photo placement area (%)",
    templateSave: "Save frame",
    templateUpdate: "Update frame",
    templateDelete: "Delete frame",
    campaignFramesTitle: "Frames for this campaign",
    campaignFramesHint: "Manage frames right here — no page switching needed.",
    saveThisCampaignFirst: "Save this campaign first to start adding frames.",
    fQuickAdd: "Quick-add common fields",
    kpiTotal: "Total downloads",
    kpiActive: "Active campaigns",
    kpiTop: "Top campaign",
    byCampaign: "Downloads by campaign",
    byUnit: "Downloads by business unit",
    byDay: "Downloads by day (last 7 days)",
    liveDataNote: "(sample data — not yet connected to real data)",
  },
} as const;

export type AdminLang = "vi" | "en";
export type AdminDictKey = keyof typeof ADMIN_DICT["vi"];

interface AdminLangContextValue {
  lang: AdminLang;
  setLang: (lang: AdminLang) => void;
  t: (key: AdminDictKey) => string;
}

const AdminLangContext = createContext<AdminLangContextValue | null>(null);

function loadSavedLang(): AdminLang {
  try {
    const saved = localStorage.getItem(ADMIN_LANG_STORAGE_KEY);
    return saved === "vi" || saved === "en" ? saved : "vi";
  } catch {
    return "vi";
  }
}

export function AdminLangProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<AdminLang>("vi");

  useEffect(() => {
    setLangState(loadSavedLang());
  }, []);

  const setLang = useCallback((next: AdminLang) => {
    setLangState(next);
    try {
      localStorage.setItem(ADMIN_LANG_STORAGE_KEY, next);
    } catch {
      // storage unavailable — language choice just won't persist across reloads
    }
  }, []);

  const t = useCallback(
    (key: AdminDictKey) => (ADMIN_DICT[lang] as Record<string, string>)[key] ?? key,
    [lang],
  );

  return <AdminLangContext.Provider value={{ lang, setLang, t }}>{children}</AdminLangContext.Provider>;
}

export function useAdminLang(): AdminLangContextValue {
  const ctx = useContext(AdminLangContext);
  if (!ctx) throw new Error("useAdminLang must be used within AdminLangProvider");
  return ctx;
}
