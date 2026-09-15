# Trimmed CMaps

This folder originally shipped 169 CJK character maps (~1.2 MB) from PDF.js.
Safar English only serves English + Hindi PDFs, so we keep just the four
`Adobe-*-UCS2.bcmap` fallback Unicode mappings (~52 KB total).

Do NOT re-add the full cmaps directory on PDF.js upgrades unless we start
rendering Chinese / Japanese / Korean content. Re-adding adds ~1.1 MB to
the APK with zero user benefit for our content set.
