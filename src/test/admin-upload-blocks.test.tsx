import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThumbnailUploadBlock } from "@/features/admin-upload/components/ThumbnailUploadBlock";
import { VideoUploadBlock } from "@/features/admin-upload/components/VideoUploadBlock";
import { ContentSourceBlock } from "@/features/admin-upload/components/ContentSourceBlock";

// MediaPreview fetches/inspects media — stub it out for these render tests.
vi.mock("@/components/admin/MediaPreview", () => ({
  default: (props) => <div data-testid="media-preview">{props.type}</div>,
}));

const dragProps = {
  onDrag: vi.fn(),
  setDragActive: vi.fn(),
  onDrop: vi.fn(),
};

const makeFile = (name: string, type: string, size = 1024) => {
  const f = new File(["x"], name, { type });
  Object.defineProperty(f, "size", { value: size });
  return f;
};

describe("ThumbnailUploadBlock", () => {
  const base = {
    mode: "file" as const,
    onModeChange: vi.fn(),
    thumbnailUrl: "",
    onThumbnailUrlChange: vi.fn(),
    thumbnailFile: null,
    uploading: false,
    dragActive: false,
    ...dragProps,
    onFilePicked: vi.fn(),
  };

  it("file mode mein drop zone aur limit hint dikhata hai", () => {
    render(<ThumbnailUploadBlock {...base} />);
    expect(screen.getByText(/Drag & drop thumbnail image/)).toBeTruthy();
    expect(screen.getByText(/max 10MB/)).toBeTruthy();
  });

  it("uploading ke waqt progress text dikhata hai", () => {
    render(<ThumbnailUploadBlock {...base} uploading />);
    expect(screen.getByText("Uploading thumbnail...")).toBeTruthy();
  });

  it("upload ho chuki image ka naam aur preview dikhata hai", () => {
    const file = makeFile("cover.png", "image/png");
    render(<ThumbnailUploadBlock {...base} thumbnailFile={file} thumbnailUrl="https://x/y.png" />);
    expect(screen.getByText("cover.png")).toBeTruthy();
    expect(screen.getByAltText("Thumbnail")).toBeTruthy();
  });

  it("URL mode mein typing parent tak jaati hai", () => {
    const onThumbnailUrlChange = vi.fn();
    render(<ThumbnailUploadBlock {...base} mode="url" onThumbnailUrlChange={onThumbnailUrlChange} />);
    fireEvent.change(screen.getByPlaceholderText(/thumbnail image URL/), { target: { value: "https://a/b.jpg" } });
    expect(onThumbnailUrlChange).toHaveBeenCalledWith("https://a/b.jpg");
  });

  it("file chunne par onFilePicked call hota hai", () => {
    const onFilePicked = vi.fn();
    const { container } = render(<ThumbnailUploadBlock {...base} onFilePicked={onFilePicked} />);
    const input = container.querySelector("#thumbFileInput") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("a.png", "image/png")] } });
    expect(onFilePicked).toHaveBeenCalled();
  });

  it("toggle buttons mode badalte hain", () => {
    const onModeChange = vi.fn();
    render(<ThumbnailUploadBlock {...base} onModeChange={onModeChange} />);
    fireEvent.click(screen.getByText("URL"));
    expect(onModeChange).toHaveBeenCalledWith("url");
  });
});

describe("VideoUploadBlock", () => {
  const base = {
    isLive: false,
    mode: "url" as const,
    onModeChange: vi.fn(),
    videoUrl: "",
    onVideoUrlChange: vi.fn(),
    videoFile: null,
    uploading: false,
    progress: 0,
    dragActive: false,
    ...dragProps,
    onFilePicked: vi.fn(),
  };

  it("LIVE par self-storage toggle nahi dikhata", () => {
    render(<VideoUploadBlock {...base} isLive />);
    expect(screen.getByText("YouTube Live / Meeting URL")).toBeTruthy();
    expect(screen.queryByText("Self Storage")).toBeNull();
  });

  it("URL bharne par preview dikhata hai", () => {
    render(<VideoUploadBlock {...base} videoUrl="https://youtu.be/abc" />);
    expect(screen.getByTestId("media-preview").textContent).toBe("video");
  });

  it("file mode mein 500MB hint aur bucket badge dikhata hai", () => {
    render(<VideoUploadBlock {...base} mode="file" />);
    expect(screen.getByText(/max 500MB/)).toBeTruthy();
    expect(screen.getByText(/course-videos bucket/)).toBeTruthy();
  });

  it("uploading par progress bar width set hoti hai", () => {
    const { container } = render(<VideoUploadBlock {...base} mode="file" uploading progress={42} />);
    const bar = container.querySelector('[style*="width: 42%"]');
    expect(bar).toBeTruthy();
  });

  it("upload complete par file ka size MB mein dikhata hai", () => {
    const file = makeFile("lec.mp4", "video/mp4", 2 * 1024 * 1024);
    render(<VideoUploadBlock {...base} mode="file" videoFile={file} videoUrl="https://s/v.mp4" />);
    expect(screen.getByText(/2\.0 MB/)).toBeTruthy();
  });
});

describe("ContentSourceBlock", () => {
  const base = {
    uploadType: "PDF",
    mode: "file" as const,
    onModeChange: vi.fn(),
    file: null,
    onFileChange: vi.fn(),
    url: "",
    onUrlChange: vi.fn(),
  };

  it("upload type heading mein dikhta hai", () => {
    render(<ContentSourceBlock {...base} uploadType="NOTES" />);
    expect(screen.getByText("Upload NOTES")).toBeTruthy();
  });

  it("file chunne par onFileChange call hota hai", () => {
    const onFileChange = vi.fn();
    const { container } = render(<ContentSourceBlock {...base} onFileChange={onFileChange} />);
    const input = container.querySelector("#pdfFile") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [makeFile("notes.pdf", "application/pdf")] } });
    expect(onFileChange).toHaveBeenCalled();
  });

  it("chuni hui file ka naam aur preview dikhata hai", () => {
    render(<ContentSourceBlock {...base} file={makeFile("notes.pdf", "application/pdf")} />);
    expect(screen.getByText("notes.pdf")).toBeTruthy();
    expect(screen.getByTestId("media-preview").textContent).toBe("pdf");
  });

  it("URL mode mein link input dikhta hai aur type hota hai", () => {
    const onUrlChange = vi.fn();
    render(<ContentSourceBlock {...base} mode="url" onUrlChange={onUrlChange} />);
    fireEvent.change(screen.getByPlaceholderText("Paste direct link..."), { target: { value: "https://a/b.pdf" } });
    expect(onUrlChange).toHaveBeenCalledWith("https://a/b.pdf");
  });
});
