# Knowledge Hub PDFs: Telegram/CDN link fix

## Kya check kiya (live, abhi)

Telegram-backed link `https://storage-naveenbharat-recording.vercel.app/view/545ff388-...` ko upstream tak trace kiya:

- Viewer page 200 deta hai (ek Lovable SPA hai, PDF nahi).
- Uska upstream project `hsvtagmckkfmniawflul.supabase.co` hai, aur uska **anon key app ke public JS bundle me hi shipped hai** — yani woh publishable key hai, secret nahi.
- Us key ke saath maine khud dono upstream calls chalayi:
  - metadata: `pdf_documents?id=eq.545ff388-...` → **200**, `file_name = morpho_compressed.pdf`
  - bytes: `functions/v1/telegram-get-file` → **200**, 5.4 MB, header `%PDF-1.4` (asli PDF)

Matlab upstream bilkul theek hai. Problem sirf hamare side hai: `resolve-storage-pdf` edge function `TELEGRAM_STORAGE_ANON_KEY` secret se key leta hai, aur us secret me jo value padi hai woh opaque (`sb_…`) key hai jise upstream project pehchanta hi nahi — isliye har request `401 → 503 storage_key_rejected` ban jaati hai.

## Fix

1. **Secret hatao.** `TELEGRAM_STORAGE_ANON_KEY` delete kar dunga. Yeh kabhi secret tha hi nahi (public bundle me hai) aur galat value ki wajah se lesson toot raha hai.
2. **`resolve-storage-pdf` me key inline karo.** Upstream ka publishable anon JWT function me constant ki tarah rakhunga, saath me `Deno.env.get("TELEGRAM_STORAGE_ANON_KEY")` override bhi bana rahega — agar future me upstream key rotate ho to sirf secret set karke override kiya ja sake, code chhue bina.
3. **`storage_key_missing` short-circuit hatao.** Ab default key hamesha maujood hai, isliye woh 503 branch dead ho jaayega; sirf upstream genuinely 401 de tab hi `storage_key_rejected` bache.
4. **Content-Type force karo.** Upstream `application/octet-stream` bhejta hai; pdf.js kabhi-kabhi ispe atakta hai. Response ko hamesha `application/pdf` bhejunga aur `file_name` (`morpho_compressed.pdf`) ko `Content-Disposition` me rakhunga.
5. **Deploy + verify.** Function deploy karke admin JWT se live call karunga aur confirm karunga ki `%PDF` bytes aa rahe hain, phir baaki 6 Knowledge Hub lessons (GitHub CDN, Drive, Google Sheet export, Notion, Archive.org, YouTube) ko dobara hit karke ek final pass/fail table dunga.

## Technical detail

- File: `supabase/functions/resolve-storage-pdf/index.ts` — sirf key resolution, missing-key branch aur response headers badalte hain. Entitlement gate (free lesson / free course / admin / teacher / active enrollment) aur `lessons.video_url` lookup jaise hai waise rahega, koi access widening nahi.
- Client (`src/lib/native/naveenStoragePdf.ts`) me koi change nahi — woh already JSON error body surface karta hai.
- Koi database migration nahi.
- `docs/AUDIT-2026-08-01-knowledge-hub-pdfs.md` me "Still open" wali entry ko resolved mark kar dunga with the verified root cause.
