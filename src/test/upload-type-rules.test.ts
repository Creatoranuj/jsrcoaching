import { describe, it, expect } from "vitest";
import {
  UPLOAD_TYPES,
  uploadTypeLabel,
  uploadTypeIcon,
  uploadTypeColor,
  buildUploadBreadcrumb,
} from "@/features/admin-upload/lib/uploadRules";

describe("upload type presentation", () => {
  it("labels every type", () => {
    expect(UPLOAD_TYPES).toHaveLength(7);
    expect(uploadTypeLabel("VIDEO")).toBe("Lecture");
    expect(uploadTypeLabel("LIVE")).toBe("Live Class");
    expect(uploadTypeLabel("DPP_ATTEMPT")).toBe("DPP Attempt");
  });

  it("falls back to the raw value for unknown types", () => {
    expect(uploadTypeLabel("SOMETHING")).toBe("SOMETHING");
    expect(uploadTypeColor("SOMETHING")).toBe("bg-muted text-muted-foreground");
  });

  it("picks the icon family per type", () => {
    expect(uploadTypeIcon("VIDEO")).toBe("video");
    expect(uploadTypeIcon("LIVE")).toBe("video");
    expect(uploadTypeIcon("TEST")).toBe("test");
    expect(uploadTypeIcon("NOTES")).toBe("document");
  });

  it("keeps distinct colours for each type", () => {
    const colours = UPLOAD_TYPES.map(uploadTypeColor);
    expect(colours.every((c) => c !== "bg-muted text-muted-foreground")).toBe(true);
  });
});

describe("buildUploadBreadcrumb", () => {
  it("shows only the root when nothing is selected", () => {
    expect(buildUploadBreadcrumb()).toEqual([{ label: "Upload Center", clickable: false }]);
  });

  it("makes the root clickable once a course is selected", () => {
    expect(buildUploadBreadcrumb("Physics")).toEqual([
      { label: "Upload Center", clickable: true },
      { label: "Physics", clickable: false },
    ]);
  });

  it("makes ancestors clickable and the leaf plain", () => {
    expect(buildUploadBreadcrumb("Physics", "Kinematics")).toEqual([
      { label: "Upload Center", clickable: true },
      { label: "Physics", clickable: true },
      { label: "Kinematics", clickable: false },
    ]);
  });
});
