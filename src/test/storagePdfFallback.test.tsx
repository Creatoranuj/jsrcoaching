import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { friendlyPdfErrorMessage } from "@/lib/pdfErrorMessage";

const STORAGE_URL =
  "https://storage-naveenbharat-recording.vercel.app/view/545ff388-3dfc-40ea-89a3-350004e541a4";

vi.mock("@/lib/native/naveenStoragePdf", async () => {
  const actual = await vi.importActual<typeof import("@/lib/native/naveenStoragePdf")>(
    "@/lib/native/naveenStoragePdf",
  );
  return {
    ...actual,
    resolveStorageBytes: vi.fn(async () => {
      throw new Error("यह document अभी available नहीं है — admin को बताएँ। (storage_key_rejected)");
    }),
  };
});

import { useLocalPdfSource } from "@/hooks/useLocalPdfSource";

describe("storage viewer PDFs never fall back to the HTML page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("surfaces the proxy error instead of handing pdf.js the viewer URL", async () => {
    const { result } = renderHook(() => useLocalPdfSource(STORAGE_URL));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.src).toBeNull();
    expect(result.current.error).toBeTruthy();
  });
});

describe("friendlyPdfErrorMessage storage codes", () => {
  it("maps storage_key_rejected", () => {
    expect(friendlyPdfErrorMessage(new Error("boom (storage_key_rejected)"), STORAGE_URL)).toMatch(/storage key issue/);
  });
  it("maps entitlement failures", () => {
    expect(friendlyPdfErrorMessage(new Error("Not entitled to this document"), STORAGE_URL)).toMatch(/Enroll/);
  });
  it("maps unregistered assets", () => {
    expect(friendlyPdfErrorMessage(new Error("Asset not registered"), STORAGE_URL)).toMatch(/re-add/);
  });
});
