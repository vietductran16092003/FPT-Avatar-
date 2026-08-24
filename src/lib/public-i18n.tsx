"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const PUBLIC_LANG_STORAGE_KEY = "afp_public_lang";

const PUBLIC_DICT = {
  vi: {
    heroTitle: "Chọn chiến dịch đang diễn ra",
    heroSubtitle: "Các chiến dịch avatar đang mở — chọn một chiến dịch để bắt đầu.",
    noCampaignsTitle: "Chưa có chiến dịch nào đang mở",
    notReadyHint: "Chưa có khung ảnh, vui lòng quay lại sau.",
    statusActive: "Đang diễn ra",
    campaignNotReady: "Chiến dịch này đang được chuẩn bị khung ảnh, chưa thể tạo avatar. Vui lòng quay lại sau.",
    backHome: "← Trang chủ",
    stepUpload: "1. Tải ảnh của bạn",
    stepUploadHint: "Chọn một ảnh chân dung rõ mặt, định dạng JPG hoặc PNG, tối đa 10MB.",
    dropTitle: "Kéo & thả ảnh vào đây",
    dropSub: "hoặc bấm để chọn tệp từ máy tính",
    changePhoto: "Đổi ảnh khác",
    stepTemplate: "2. Chọn khung",
    stepOverlay: "3. Điền thông tin",
    previewTitle: "Xem trước",
    previewNote: "Bản xem trước dựng trực tiếp trên trình duyệt của bạn. Ảnh chính thức được máy chủ ghép lại từ ảnh gốc trước khi tải xuống.",
    downloadButton: "Tải ảnh về máy",
    shareTitle: "Chia sẻ lên",
    zoomHint: "Kéo ảnh để di chuyển, dùng thanh trượt để phóng to/thu nhỏ",
    warnTitle: "Chưa thể tải ảnh xuống",
    warnMissingPhoto: "Bạn chưa hoàn thành Bước 1 — Tải ảnh lên.",
    warnIncompleteFields: "Bạn chưa điền đầy đủ thông tin ở Bước 3.",
    closedNotice: "Chiến dịch này đã kết thúc. Hẹn gặp lại ở chiến dịch tiếp theo!",
    errorGeneric: "Đã xảy ra lỗi khi thực hiện thao tác. Vui lòng thử lại.",
    notifTitle: "Thông báo",
    notifEmpty: "Chưa có thông báo nào.",
    notifMarkAllRead: "Đánh dấu đã đọc",
    notifJustNow: "Vừa xong",
    notifMinAgo: "phút trước",
    notifHourAgo: "giờ trước",
  },
  en: {
    heroTitle: "Choose a running campaign",
    heroSubtitle: "These avatar campaigns are open now — pick one to get started.",
    noCampaignsTitle: "No campaigns are open right now",
    notReadyHint: "No frames yet, please check back later.",
    statusActive: "Live now",
    campaignNotReady: "This campaign is still being set up with frames and isn't ready yet. Please check back soon.",
    backHome: "← Home",
    stepUpload: "1. Upload your photo",
    stepUploadHint: "Choose a clear portrait photo, JPG or PNG, up to 10MB.",
    dropTitle: "Drag & drop your photo",
    dropSub: "or click to browse your computer",
    changePhoto: "Change photo",
    stepTemplate: "2. Choose a frame",
    stepOverlay: "3. Fill in your info",
    previewTitle: "Preview",
    previewNote: "This preview is rendered locally in your browser. The final image is composited server-side from your original photo before download.",
    downloadButton: "Download image",
    shareTitle: "Share to",
    zoomHint: "Drag to reposition, use the slider to zoom in/out",
    warnTitle: "Can't download yet",
    warnMissingPhoto: "You haven't completed Step 1 — Upload a photo.",
    warnIncompleteFields: "You haven't filled in all Step 3 fields yet.",
    closedNotice: "This campaign has ended. See you at the next one!",
    errorGeneric: "Something went wrong. Please try again.",
    notifTitle: "Notifications",
    notifEmpty: "No notifications yet.",
    notifMarkAllRead: "Mark all read",
    notifJustNow: "Just now",
    notifMinAgo: "min ago",
    notifHourAgo: "hr ago",
  },
} as const;

export type PublicLang = "vi" | "en";
export type PublicDictKey = keyof typeof PUBLIC_DICT["vi"];

interface PublicLangContextValue {
  lang: PublicLang;
  setLang: (lang: PublicLang) => void;
  t: (key: PublicDictKey) => string;
}

const PublicLangContext = createContext<PublicLangContextValue | null>(null);

function loadSavedLang(): PublicLang {
  try {
    const saved = localStorage.getItem(PUBLIC_LANG_STORAGE_KEY);
    return saved === "vi" || saved === "en" ? saved : "vi";
  } catch {
    return "vi";
  }
}

export function PublicLangProvider({ children }: { children: React.ReactNode }) {
  const existing = useContext(PublicLangContext);
  const [lang, setLangState] = useState<PublicLang>("vi");

  useEffect(() => {
    setLangState(loadSavedLang());
  }, []);

  const setLang = useCallback((next: PublicLang) => {
    setLangState(next);
    try {
      localStorage.setItem(PUBLIC_LANG_STORAGE_KEY, next);
    } catch {
      // storage unavailable — language choice just won't persist across reloads
    }
  }, []);

  const t = useCallback(
    (key: PublicDictKey) => (PUBLIC_DICT[lang] as Record<string, string>)[key] ?? key,
    [lang],
  );

  // If a PublicLangProvider already exists above this one in the tree, defer to it
  // instead of creating a second, disconnected context (e.g. components that
  // self-wrap for standalone unit testing but are also mounted under the layout's
  // provider in the real app).
  if (existing) {
    return <>{children}</>;
  }

  return <PublicLangContext.Provider value={{ lang, setLang, t }}>{children}</PublicLangContext.Provider>;
}

export function usePublicLang(): PublicLangContextValue {
  const ctx = useContext(PublicLangContext);
  if (!ctx) throw new Error("usePublicLang must be used within PublicLangProvider");
  return ctx;
}
