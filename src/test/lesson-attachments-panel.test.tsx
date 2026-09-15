import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { LessonAttachmentsPanel } from "@/features/lesson/components/LessonAttachmentsPanel";

vi.mock("@/components/lesson/AttachmentRow", () => ({
  AttachmentRow: ({ attachment }: any) => <div data-testid="attachment-row">{attachment.file_name}</div>,
}));

const pdfs = [
  { id: "p1", file_name: "Chapter 1 Notes.pdf", file_url: "https://cdn.test/p1.pdf" },
  { id: "p2", file_name: "Formula Sheet.pdf", file_url: "https://cdn.test/p2.pdf" },
];

const notesToggle = () => document.querySelector("[aria-expanded]") as HTMLElement;

const renderPanel = (over: Partial<React.ComponentProps<typeof LessonAttachmentsPanel>> = {}) =>
  render(
    <LessonAttachmentsPanel
      lessonTitle="Trigonometry Basics"
      classPdfUrl={null}
      pdfs={pdfs}
      attachments={[]}
      notesOpen
      onToggleNotes={vi.fn()}
      onOpenPdf={vi.fn()}
      resolveAttachmentUrl={vi.fn()}
      onAttachmentDownloaded={vi.fn()}
      pdfsLoading={false}
      attachmentsLoading={false}
      {...over}
    />,
  );

describe("LessonAttachmentsPanel", () => {
  it("lists every lesson PDF under Notes", () => {
    renderPanel();
    expect(screen.getByText("Notes")).toBeTruthy();
    expect(screen.getByText("Chapter 1 Notes.pdf")).toBeTruthy();
    expect(screen.getByText("Formula Sheet.pdf")).toBeTruthy();
  });

  it("shows the class notes entry built from the lesson title", () => {
    renderPanel({ classPdfUrl: "https://cdn.test/class.pdf" });
    expect(screen.getByText("Trigonometry Basics : Class Notes")).toBeTruthy();
  });

  it("hides the Notes section when there is no class PDF and no lesson PDFs", () => {
    renderPanel({ pdfs: [], classPdfUrl: null });
    expect(screen.queryByText("Notes")).toBeNull();
  });

  it("opens the tapped PDF with its id, name and url", () => {
    const onOpenPdf = vi.fn();
    renderPanel({ onOpenPdf });
    fireEvent.click(screen.getByText("Formula Sheet.pdf"));
    expect(onOpenPdf).toHaveBeenCalledWith({
      id: "p2",
      file_name: "Formula Sheet.pdf",
      file_url: "https://cdn.test/p2.pdf",
    });
  });

  it("opens the class PDF under a synthetic class-pdf id", () => {
    const onOpenPdf = vi.fn();
    renderPanel({ classPdfUrl: "https://cdn.test/class.pdf", onOpenPdf });
    fireEvent.click(screen.getByText("Trigonometry Basics : Class Notes"));
    expect(onOpenPdf).toHaveBeenCalledWith(expect.objectContaining({ id: "class-pdf" }));
  });

  it("toggles the Notes list", () => {
    const onToggleNotes = vi.fn();
    renderPanel({ onToggleNotes });
    fireEvent.click(notesToggle());
    expect(onToggleNotes).toHaveBeenCalled();
  });

  it("marks the collapsed state on the toggle for screen readers", () => {
    renderPanel({ notesOpen: false });
    expect(notesToggle().getAttribute("aria-expanded")).toBe("false");
  });

  it("renders generic attachments in their own section", () => {
    renderPanel({ attachments: [{ id: "a1", file_name: "worksheet.docx" }] });
    expect(screen.getByText("Attachments")).toBeTruthy();
    expect(screen.getByTestId("attachment-row").textContent).toBe("worksheet.docx");
  });

  it("shows the empty state only when nothing is present and nothing is loading", () => {
    renderPanel({ pdfs: [], classPdfUrl: null });
    expect(screen.getByText("No attachments available for this lesson.")).toBeTruthy();
  });

  it("suppresses the empty state while still loading", () => {
    renderPanel({ pdfs: [], classPdfUrl: null, pdfsLoading: true });
    expect(screen.queryByText("No attachments available for this lesson.")).toBeNull();
  });
});
