# Q Bank Web

Phiên bản web (để học trên máy tính / trình duyệt) của app Q Bank, dựng lại từ thiết kế mobile
(`../client_q_bank`, Figma "Q Bank — Mobile" v2) và gọi thẳng vào **backend production**
(`https://back-q-bank.vodat10998.workers.dev/api/v1`).

| Mảng         | Thư viện                                                        |
| ------------ | --------------------------------------------------------------- |
| Build        | Vite 8 · React 19 · TypeScript 6                                |
| UI           | Tailwind CSS v4 + shadcn/ui (Radix) · lucide-react · sonner     |
| Điều hướng   | React Router 7 (mỗi màn hình là một chunk tải lười)             |
| Server state | TanStack Query 5                                                |
| API          | ky 2 + zod 4 (kiểm tra mọi response) — dùng chung code với mobile |
| Client state | zustand 5 + `persist` vào localStorage                          |
| Form / i18n  | react-hook-form + zod · i18next (vi / en, key được kiểm tra type) |
| Test         | Vitest (các test thuần được port từ mobile)                     |
| Deploy       | Firebase Hosting                                                |

## Tính năng (giống app mobile)

- Đăng nhập / đăng ký, tự refresh access token, đồng bộ đăng nhập giữa các tab.
- **Đề thi**: danh sách → chi tiết đề (phân bố độ khó, lĩnh vực, cấu trúc phần) → bắt đầu / tiếp tục / làm lại.
- **Làm bài theo phần** (SECTIONED): đồng hồ từng phần chạy trên trình duyệt, tạm dừng khi ẩn tab,
  gạch đáp án, đánh dấu, mức tự tin, nghỉ giữa phần, xem lại phần; làm được cả khi mất mạng và tự đồng bộ lại.
- **Làm bài kiểu cũ** (LEGACY): đếm ngược theo giờ server, lưu đáp án ngay khi chọn, tự nộp khi hết giờ.
- **Kết quả** + phân tích quyết định, **xem lại đáp án** có bộ lọc và bản đồ câu hỏi.
- **Luyện tập** từ ngân hàng câu hỏi (kiểm tra ngay, có giải thích).
- **Lịch sử**, **Báo cáo** (một đề / so sánh nhiều đề, biểu đồ, heatmap), **Cài đặt** (theme, ngôn ngữ, mục tiêu ngày, đồng bộ, bảo mật).
- Phím tắt khi làm bài: `←` / `→` chuyển câu, `F` đánh dấu.

Khác mobile: không có nhắc lịch học (thông báo local của điện thoại); token lưu trong localStorage (web không có keychain).

## Chạy local

```bash
npm install
npm run dev        # http://localhost:5173
```

Khi chạy `npm run dev` mà không đặt `VITE_API_URL`, app gọi `/api/...` trên chính dev server và Vite
**proxy sang production** (xem `vite.config.ts`), nên không cần cấu hình CORS để phát triển.
Muốn trỏ vào backend local: `API_PROXY_TARGET=http://localhost:8787 npm run dev`.

## Build & deploy (Firebase Hosting)

```bash
npm run check      # typecheck + test
npm run build      # → dist/
```

1. Cài Firebase CLI (`npm i -g firebase-tools`), `firebase login`, rồi `firebase use --add` chọn project
   (tạo ra `.firebaserc`).
2. **Bật CORS cho domain web trên backend** (bắt buộc — production hiện chặn mọi origin trình duyệt):
   trong `../back_q_bank/wrangler.jsonc` đặt
   `"CORS_ORIGINS": "https://<project-id>.web.app,https://<project-id>.firebaseapp.com"`
   (thêm domain riêng nếu có), rồi deploy lại Worker.
3. `npm run deploy` (build + `firebase deploy --only hosting`).

`firebase.json` đã có rewrite SPA (`** → /index.html`) và cache dài hạn cho `/assets/**`.

## Biến môi trường

Xem `.env.example`. Chỉ biến `VITE_*` vào bundle — không đặt secret ở đây.

| Biến                 | Mặc định                                             |
| -------------------- | ---------------------------------------------------- |
| `VITE_API_URL`       | production (`.../api/v1`); khi `dev` thì dùng proxy  |
| `VITE_SUPPORT_EMAIL` | trống (ẩn mục "Trợ giúp & góp ý")                    |

## Cấu trúc

```
src/
├── app.tsx          # router + guard đăng nhập
├── api/             # ky client, schema zod, query hook (port từ mobile)
├── attempt-engine/  # engine làm bài theo phần (thuần, port nguyên từ mobile)
├── components/
│   ├── ui/          # shadcn/ui primitives (npx shadcn add … thêm vào đây)
│   ├── app/         # thành phần thiết kế riêng: brand gradient, icon tile, progress ring…
│   ├── charts/      # biểu đồ SVG
│   ├── question/    # hiển thị câu hỏi / đáp án
│   └── layout/      # app shell (sidebar desktop, tab bar mobile)
├── screens/         # từng màn hình
├── stores/          # zustand + storage localStorage
├── i18n/            # vi.json / en.json (giữ đồng bộ với mobile)
└── index.css        # theme token (shadcn + màu thương hiệu từ mobile)
```

Quy ước code chi tiết nằm trong [AGENTS.md](AGENTS.md).
