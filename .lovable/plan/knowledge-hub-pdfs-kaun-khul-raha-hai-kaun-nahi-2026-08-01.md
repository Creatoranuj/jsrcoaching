# Knowledge Hub PDFs — kaun khul raha hai, kaun nahi

Knowledge Hub course me 7 lessons hain. Link `lessons.video_url` me store hai (PDF lessons ke liye `class_pdf_url` khaali hai — ye theek hai, reader `video_url` par fallback karta hai).

## Live check ka result (har source ko directly test kiya)

| # | Lesson | Source | Upstream test | Status |
|---|--------|--------|----------------|--------|
| 1 | PDF BY GIT | jsDelivr (GitHub) | 200, `application/pdf`, 432 KB | Khulega |
| 2 | CDN BY TG | storage-naveenbharat (Telegram) | `/view/` page HTML deta hai; asli PDF `resolve-storage-pdf` function se aata hai | **Nahi khulega** — server key missing |
| 3 | PDF BY Notion | app.notion.com page | `notion-page` function 200, recordMap mila | Khulega (in-app Notion render, PDF nahi) |
| 4 | PDF BY DRIVE | Google Drive file | 200, PDF bytes (910 KB) | Khulega |
| 5 | PDF BY Google Sheet | Sheets export | 200, `application/pdf`, 68 KB | Khulega |
| 6 | (Docs link md file me) | Docs export | 200, `application/pdf`, 475 KB | Khulega — lekin ye lesson course me abhi hai hi nahi |
| 7 | PDF BY ARCHIVES | archive.org item | metadata me 2 PDF mile | Khulega |
| — | Lets talk about Business | YouTube | — | Video lesson, is scope me nahi |

## Ek confirmed blocker

`supabase/functions/resolve-storage-pdf/index.ts` upstream Telegram-storage project ko `TELEGRAM_STORAGE_ANON_KEY` se call karta hai. Project ke configured secrets me ye naam **maujood nahi hai**, aur code me fallback `""` hai — matlab CDN BY TG lesson har student ke liye fail karega. Baaki 5 sources ka data path saaf hai.

Plan is secret ko add karke fix karne ka hai, aur uske baad in-app se dobara verify karne ka.

## Kaam jo karna hai

1. **TELEGRAM_STORAGE_ANON_KEY add karna** — aapse upstream storage project ki anon key leni hogi (secret ke roop me, code me nahi). Uske bina CDN BY TG lesson theek nahi ho sakta.
2. **`resolve-storage-pdf` me clear error** — key missing ho to student ko generic failure ki jagah "ye document abhi available nahi hai, admin ko batayein" dikhe, aur server log me `storage_key_missing` jaaye.
3. **Notion lesson ka label** — ye PDF nahi, web page hai. Lesson type `PDF` hone se student PDF toolbar (download/print) expect karta hai jo Notion render me nahi milta. Do options: lesson ko `NOTES` type kar dena, ya Notion viewer par "Web page" badge dikhana. Main badge wala rasta lunga — data change nahi, sirf UI honest ho jayega.
4. **Missing Docs lesson** — aapke md file ka Google Docs link course me upload hi nahi hua. Batayein to us lesson ko add karne ka step bhi shaamil kar dunga.
5. **Logged-in verification** — test account se saaton lesson kholkar screenshot + console error check, taaki "khulega" sirf theory na rahe.
6. **Audit report** — `docs/AUDIT-2026-08-01-knowledge-hub-pdfs.md` me har link ka status, root cause aur rating.

## Technical notes

- `pdf-proxy` ka `ALLOWED_HOSTS` allow-list pehle se in sab hosts ko cover karta hai (jsdelivr, naveenbharat, googleusercontent, archive.org) aur `docs.google.com` sirf `/export` path par — SSRF guard sahi hai, koi badlav nahi chahiye.
- `resolveArchivePdfUrl` sabse chhota PDF chunta hai; is item me `..._text.pdf` chhota hai, to text-layer version khulega. Agar aap scan version chahte hain to preference flip karna hoga — batayein.
- Koi database migration is kaam me nahi chahiye.
