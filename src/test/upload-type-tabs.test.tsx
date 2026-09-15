import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { UploadTypeTabs } from "@/features/admin-upload/components/UploadTypeTabs";
import { UploadBreadcrumb } from "@/features/admin-upload/components/UploadBreadcrumb";

describe("UploadTypeTabs", () => {
  it("renders every type and reports the picked one", () => {
    const onChange = vi.fn();
    render(<UploadTypeTabs value="VIDEO" onChange={onChange} />);
    expect(screen.getAllByRole("button")).toHaveLength(7);
    fireEvent.click(screen.getByRole("button", { name: "DPP Attempt" }));
    expect(onChange).toHaveBeenCalledWith("DPP_ATTEMPT");
  });

  it("highlights the active type", () => {
    render(<UploadTypeTabs value="NOTES" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Notes" }).className).toContain("bg-primary");
    expect(screen.getByRole("button", { name: "PDF" }).className).not.toContain("bg-primary ");
  });
});

describe("UploadBreadcrumb", () => {
  it("navigates back to the root and the course", () => {
    const onGoToRoot = vi.fn();
    const onGoToCourse = vi.fn();
    render(
      <UploadBreadcrumb
        courseTitle="Physics"
        chapterTitle="Kinematics"
        onGoToRoot={onGoToRoot}
        onGoToCourse={onGoToCourse}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Upload Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Physics" }));
    expect(onGoToRoot).toHaveBeenCalledTimes(1);
    expect(onGoToCourse).toHaveBeenCalledTimes(1);
    // leaf is not a button
    expect(screen.queryByRole("button", { name: "Kinematics" })).not.toBeInTheDocument();
  });

  it("renders just the root when no course is open", () => {
    render(<UploadBreadcrumb onGoToRoot={vi.fn()} onGoToCourse={vi.fn()} />);
    expect(screen.getByText("Upload Center")).toBeInTheDocument();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});
