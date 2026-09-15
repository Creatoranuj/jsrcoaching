/**
 * Integration test: PDF source routing.
 *
 * Verifies that each notes delivery method the app supports — CDN/jsDelivr,
 * Google Drive, Notion, Vercel (NaveenBharat) storage, GitHub storage CDN, and
 * generic signed URLs — is classified and routed to the correct in-app render
 * path. This locks the contract so a future change can't silently break one
 * source (e.g. send Drive through the canvas reader, which CORS-blocks it).
 */
import { describe, it, expect } from "vitest";
import {
  isGoogleDrive,
  isGoogleDocs,
  isNotion,
  isJsDelivrCdn,
  isGithubStoragesCdn,
  isNaveenBharatStorage,
  renderablePdfUrl,
  resolveEmbedUrl,
  extractDriveFileId,
  googleExportPdfUrl,
  remotePdfProxyUrl,
  hasPdfPath,
  isArchiveOrg,
  extractArchiveId,
} from "../lib/pdfViewerUrl";
import { isKnownNonPdfWebUrl, isLikelyPdfUrl } from "../lib/detectFileType";

const SOURCES = {
  jsdelivr: "https://cdn.jsdelivr.net/gh/org/repo@main/notes/day1.pdf",
  drive: "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/view",
  notion: "https://naveenbharat.notion.site/Class-Notes-abc123def4567890abc123def4567890",
  vercel: "https://storage-naveenbharat-recording.vercel.app/notes/chapter2.pdf",
  github: "https://github-storages-cdn.vercel.app/org/repo/main/notes/day3.pdf",
  signed: "https://example.supabase.co/storage/v1/object/sign/pdfs/x.pdf?token=eyJabc.def.ghi",
};

describe("PDF source routing", () => {
  it("classifies jsDelivr CDN and routes it through the proxy", () => {
    expect(isJsDelivrCdn(SOURCES.jsdelivr)).toBe(true);
    // jsDelivr must NOT be passed raw to pdf.js — it gets proxied.
    expect(renderablePdfUrl(SOURCES.jsdelivr)).not.toBe(SOURCES.jsdelivr);
  });

  it("classifies Google Drive and routes it through proxied in-app PDF.js", () => {
    expect(isGoogleDrive(SOURCES.drive)).toBe(true);
    expect(extractDriveFileId(SOURCES.drive)).toBe("1AbCdEfGhIjKlMnOpQrStUvWxYz012345");
    expect(resolveEmbedUrl(SOURCES.drive).embedUrl).toContain("/pdfjs/web/viewer.html");
    expect(resolveEmbedUrl(SOURCES.drive).embedUrl).toContain("pdf-proxy");
    expect(resolveEmbedUrl(SOURCES.drive).isDrive).toBe(true);
  });

  it("classifies Notion pages (native renderer path)", () => {
    expect(isNotion(SOURCES.notion)).toBe(true);
    expect(isGoogleDocs(SOURCES.notion)).toBe(false);
  });

  it("routes Notion page slugs to native Notion preview, not PDF bytes, even when the title says PDF", () => {
    const notionPdfNamedPage = "https://sunset-waxflower-f5c.notion.site/Quantum-Mechanics-Test-Pdf-36d8ce5904b081c3928ddb1a9527e5a9?pvs=4";
    expect(isNotion(notionPdfNamedPage)).toBe(true);
    expect(isKnownNonPdfWebUrl(notionPdfNamedPage)).toBe(false);
    expect(isLikelyPdfUrl(notionPdfNamedPage)).toBe(false);
  });

  it("detects scheme-less Notion links pasted from the CMS", () => {
    expect(isNotion("sunset-waxflower-f5c.notion.site/Quantum-Mechanics-36d8ce5904b081c3928ddb1a9527e5a9")).toBe(true);
  });

  it("classifies Vercel / NaveenBharat storage", () => {
    expect(isNaveenBharatStorage(SOURCES.vercel)).toBe(true);
  });

  it("classifies GitHub storage CDN", () => {
    expect(isGithubStoragesCdn(SOURCES.github)).toBe(true);
  });

  it("passes generic signed URLs straight to the canvas reader", () => {
    // Not a special host → renderablePdfUrl returns it unchanged for FastPdfReader.
    expect(isGoogleDrive(SOURCES.signed)).toBe(false);
    expect(isNotion(SOURCES.signed)).toBe(false);
    expect(isJsDelivrCdn(SOURCES.signed)).toBe(false);
    expect(renderablePdfUrl(SOURCES.signed)).toBe(SOURCES.signed);
  });

  it("encodes malformed URLs with spaces so they don't blank the reader", () => {
    const messy = "https://cdn.example.com/Day 2 _Re NEET (1).pdf";
    expect(renderablePdfUrl(messy)).not.toContain(" ");
  });
});

describe("Universal document link support (7 types)", () => {
  const LINKS = {
    jsdelivrSpaces: "https://cdn.jsdelivr.net/gh/MrAnujBabu/Storage@main/Suffer English /Tense_Lecture_1.pdf",
    telegram: "https://storage-naveenbharat-recording.vercel.app/view/545ff388-3dfc-40ea-89a3-350004e541a4",
    notionApp: "https://app.notion.com/p/Notion-Integrate-Pdf-3888ce5904b0800ea8a8d485918c83b7?source=copy_link",
    drive: "https://drive.google.com/file/d/1e24A5qxZox_yeXIsUAvDSfOfV_luTcrJ/view?usp=drivesdk",
    docs: "https://docs.google.com/document/d/1gd2_jgWnY93eiDPMYF3h-j7RR_bgPiZpfPqOebuNIpw/edit?usp=drivesdk",
    sheets: "https://docs.google.com/spreadsheets/d/1BSc8VOkU5gHACAD3kpYTy-YHQdffsO_frsnXor7MsoQ/edit?usp=drivesdk",
    archive: "https://archive.org/details/Botany_Nites_Neet_2024",
  };

  it("encodes jsDelivr paths that contain spaces before proxying", () => {
    const out = renderablePdfUrl(LINKS.jsdelivrSpaces);
    expect(out).toContain("pdf-proxy");
    expect(out).not.toContain(" ");
  });

  it("keeps Telegram storage viewer pages on the storage resolver path", () => {
    expect(isNaveenBharatStorage(LINKS.telegram)).toBe(true);
    expect(isKnownNonPdfWebUrl(LINKS.telegram)).toBe(false);
    expect(hasPdfPath(LINKS.telegram)).toBe(false);
  });

  it("recognises app.notion.com pages", () => {
    expect(isNotion(LINKS.notionApp)).toBe(true);
    expect(resolveEmbedUrl(LINKS.notionApp).openUrl).not.toContain("source=copy_link");
  });

  it("keeps Drive on the proxied pdf.js path", () => {
    const r = resolveEmbedUrl(LINKS.drive);
    expect(r.isDrive).toBe(true);
    expect(r.embedUrl).toContain("pdf-proxy");
  });

  it("exports Google Docs to PDF through the proxy", () => {
    expect(googleExportPdfUrl(LINKS.docs)).toContain("/export?format=pdf");
    const r = resolveEmbedUrl(LINKS.docs);
    expect(r.embedUrl).toContain("/pdfjs/web/viewer.html");
    expect(decodeURIComponent(decodeURIComponent(r.embedUrl))).toContain("export?format=pdf");
    expect(isKnownNonPdfWebUrl(LINKS.docs)).toBe(false);
    expect(isLikelyPdfUrl(LINKS.docs)).toBe(true);
  });

  it("exports Google Sheets to landscape PDF through the proxy", () => {
    const exp = googleExportPdfUrl(LINKS.sheets)!;
    expect(exp).toContain("/spreadsheets/");
    expect(exp).toContain("portrait=false");
    expect(isKnownNonPdfWebUrl(LINKS.sheets)).toBe(false);
    const proxy = remotePdfProxyUrl(exp);
    expect(isKnownNonPdfWebUrl(proxy)).toBe(false);
    expect(isLikelyPdfUrl(proxy)).toBe(true);
  });

  it("keeps direct Telegram storage PDFs on the proxied PDF path", () => {
    const direct = "https://storage-naveenbharat-recording.vercel.app/notes/unit-1.pdf";
    expect(hasPdfPath(direct)).toBe(true);
    expect(renderablePdfUrl(direct)).toContain("pdf-proxy");
  });

  it("resolves archive.org items through pdf-proxy kind=archive", () => {
    expect(isArchiveOrg(LINKS.archive)).toBe(true);
    expect(extractArchiveId(LINKS.archive)).toBe("Botany_Nites_Neet_2024");
    const r = resolveEmbedUrl(LINKS.archive);
    expect(decodeURIComponent(r.embedUrl)).toContain("kind=archive");
    expect(isLikelyPdfUrl(LINKS.archive)).toBe(true);
  });

  it("still refuses Drive folder pages as PDFs", () => {
    expect(isKnownNonPdfWebUrl("https://drive.google.com/drive/folders/abc123")).toBe(true);
  });
});
