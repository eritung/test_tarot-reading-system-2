# 塔羅解牌系統｜GitHub Pages × Supabase 版本

這是可直接部署到 **GitHub Pages** 的塔羅解牌工具，前端為純靜態頁面，並串接：

- **Supabase Edge Function**：呼叫 OpenAI 產生解牌內容
- **Supabase Database**：儲存雲端歷史紀錄
- **localStorage**：保留本機備份與暫存狀態

目前版本已移除登入流程，打開網頁即可直接使用。

---

## 目前功能

### 占卜主頁
- 客戶姓名、問題類型、提問內容輸入
- 支援大牌／小牌抽牌
- 小牌依四大花色分類：**權杖、聖杯、寶劍、金幣**
- 可設定牌位與正逆位
- 抽牌紀錄可編輯、刪除
- 每張抽出的牌可各自產生一筆**獨立解牌結果**
- 每筆結果可個別 **重新生成**，不會把前面其他結果一起重算
- 產生解牌時按鈕會鎖定，避免重複點擊
- `下一位客戶` 可快速重置目前占卜狀態

### 歷史紀錄頁
- 顯示 **Supabase 雲端紀錄**
- 顯示 **本機備份紀錄**
- 可用關鍵字搜尋：
  - 客戶姓名
  - 問題類型
  - 問題內容
  - 牌名
  - 解牌內容
- 歷史頁的解牌內容預設為**收合**，點擊後展開
- 可刪除雲端紀錄與本機紀錄
- 可清空全部本機資料

### UI / 響應式調整
- 標題使用 **思源宋體風格**：`Noto Serif TC`
- 內文與小字使用 **黑體風格**：`Noto Sans TC`
- 手機版已針對：
  - 標題與上方按鈕置中
  - 抽牌紀錄區塊重新排版
  - 小牌四大花色改為 **2x2 顯示**
  - 搜尋區與清空本機資料按鈕自動調整排列

---

## 專案結構

```text
 tarot_app/
 ├─ index.html              # 占卜主頁
 ├─ history.html            # 歷史紀錄頁
 ├─ README.md
 └─ src/
    ├─ app.js               # 主頁互動邏輯
    ├─ history.js           # 歷史頁互動與搜尋
    ├─ styles.css           # 全站樣式
    ├─ data.js              # 牌組、花色、題型、牌位資料
    ├─ storage.js           # localStorage 狀態管理
    ├─ config.js            # Supabase / Function 設定
    └─ supabase-client.js   # Supabase client
```

---

## 需要的 Supabase 結構

### 1. `readings` 資料表
目前前端／function 會使用到的主要欄位：

- `id`
- `client_name`
- `question`
- `question_type`
- `spread_type`
- `include_reversed`
- `cards` (`jsonb`)
- `ai_result`
- `created_at`
- `updated_at`（建議保留）

如果尚未補 `updated_at`，可執行：

```sql
alter table public.readings
add column if not exists updated_at timestamptz not null default now();
```

### 2. RLS / 權限
本版本已移除登入，因此若前端要直接讀寫 `readings`，需允許 `anon` 角色存取。

至少常用到：
- `select`
- `insert`
- `delete`

若你已改成由 **Edge Function 負責寫入資料庫**，則前端可只保留 `select` / `delete`，或依你的需求再調整。

可先清理舊 policy 後重建：

```sql
drop policy if exists "Anon can read readings" on public.readings;
drop policy if exists "Anon can insert readings" on public.readings;
drop policy if exists "Anon can delete readings" on public.readings;

create policy "Anon can read readings"
on public.readings
for select
to anon
using (true);

create policy "Anon can insert readings"
on public.readings
for insert
to anon
with check (true);

create policy "Anon can delete readings"
on public.readings
for delete
to anon
using (true);
```

> 注意：這代表知道網址與公開 key 的人，理論上也能操作資料。若要更收斂，建議改由 Edge Function 統一處理寫入／刪除。

---

## Edge Function 需求

目前前端預設呼叫：

```js
const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/tarot-reading`
```

### Function 建議功能
- 接收前端送出的牌組資料
- 呼叫 OpenAI 產生解牌內容
- 回傳單筆解牌結果
- 視需求直接寫入 `readings`
- 支援指定某筆結果重新生成（例如帶 `regenerate_reading_id`）
- 已加入 CORS 才能讓 GitHub Pages 正常呼叫

### Secrets 需求
若 function 內直接寫入 Supabase，建議至少設定：

```text
OPENAI_API_KEY=...
SUPABASE_URL=https://gaixgfywxignacbgxrvk.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## 前端設定位置

位於：`src/config.js`

```js
export const SUPABASE_URL = "https://gaixgfywxignacbgxrvk.supabase.co"
export const SUPABASE_ANON_KEY = "你的 publishable key"
export const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/tarot-reading`
```

### 注意
- 前端只能放 **publishable / anon key**
- **不要**把 `service_role key` 放進前端

---

## 部署到 GitHub Pages

1. 建立 GitHub repository
2. 上傳 `tarot_app` 內的檔案
3. 到 **Settings → Pages**
4. Source 選 **Deploy from a branch**
5. Branch 選 `main`，資料夾選 `/root`
6. 儲存後等待 GitHub Pages 發布

若 repo 不是根目錄部署，請確認連結路徑是否正確。

---

## 已知注意事項

### 1. 本版本為免登入版本
目前設計目標是：**打開就能直接使用**。

這也代表：
- 不做使用者身份隔離
- 權限主要依靠 Supabase RLS 與 function 設計

### 2. localStorage 仍會保留資料
即使 Supabase 可正常寫入，前端仍保留本機備份，避免斷線或 function 異常時資料完全消失。

### 3. 歷史頁與主頁的解牌展開規則不同
- **主頁**：解牌結果直接展開顯示
- **歷史紀錄頁**：解牌結果預設收合，點擊後展開

### 4. 若 function 預設要求 JWT，免登入版會出現 401
請到 Edge Function 設定中關閉 JWT 驗證，或改成你自己的自訂驗證機制。

---

## 後續可再擴充

- 讓 Edge Function 完整接手新增／重生／更新資料
- 增加牌陣模板（如時間流、關係三角、十字牌陣）
- 增加匯出 PDF / 列印版
- 增加標籤、分類、備註欄位
- 增加多使用者權限版本

---

## 目前版本定位

這版已可作為：
- 個人塔羅占卜工具
- GitHub Pages 靜態上線版本
- 搭配 Supabase 的輕量雲端版

如果未來要變成多人正式產品，再建議往更完整的後台權限結構調整。
