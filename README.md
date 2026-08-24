FPT-Avatar-Frame-Platform/
├── .env.example                  # Mẫu biến môi trường (storage, database)
├── .gitignore
├── CLAUDE.md                     # Hướng dẫn hành vi Claude Code cho dự án
├── README.md                     # (tự sinh từ create-next-app, chưa tùy chỉnh)
├── package.json / package-lock.json
├── tsconfig.json
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.mjs
│
├── docs/                                     ← TÀI LIỆU DỰ ÁN
│   ├── origins/
│   │   └── Bao_cao_kien_truc_he_thong_...docx   # Báo cáo kiến trúc gốc (yêu cầu ban đầu)
│   └── superpowers/
│       ├── demo/                                 # Prototype UX cũ (vanilla JS, tham khảo)
│       │   ├── admin.html, index.html, styles.css
│       │   └── js/ (config/, core/)
│       ├── specs/
│       │   ├── 2026-08-20-campaign-platform-nextjs-design.md   ✅ spec CHUẨN đang dùng
│       │   ├── 2026-08-20-admin-backend-api-design.md          ⚠️ cũ, đã thay thế
│       │   └── 2026-08-20-generic-text-overlays-design.md      ⚠️ cũ, đã thay thế
│       └── plans/
│           ├── 2026-08-20-campaign-platform-nextjs.md          ✅ plan CHUẨN 15 task
│           ├── 2026-08-20-scaffold-and-storage.md               ✅ plan Task 1+2 (đã xong)
│           ├── 2026-08-20-admin-backend-api.md                 ⚠️ cũ, đã thay thế
│           └── 2026-08-20-generic-text-overlays.md              ⚠️ cũ, đã thay thế
│
├── prisma/
│   └── schema.prisma              # Model: User, Campaign, Template, GeneratedAvatar
│
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── layout.tsx, page.tsx, globals.css
│   │   └── fonts/, favicon.ico
│   └── lib/
│       ├── prisma.ts              # Prisma client singleton
│       └── storage/                # ImageStorage abstraction (Task 2)
│           ├── types.ts            # interface ImageStorage
│           ├── minio-storage.ts    # Adapter MinIO
│           └── index.ts            # Factory chọn adapter theo env var
│
└── tests/
    ├── prisma-schema.test.ts
    └── lib/storage/minio-storage.test.ts






This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
