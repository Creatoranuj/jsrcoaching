import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Regression guard for the Admin chip row.
 *
 * Two bugs shipped together and produced "the Upload chip is cut off and the
 * row won't scroll right":
 *  1. `TabsList` / `TabsTrigger` swallowed unknown props, so `data-admin-tabs`
 *     and `data-tab="..."` never reached the DOM and the auto-center effect
 *     silently matched nothing.
 *  2. `TabsList`'s base `justify-center` survived tailwind-merge, which parks
 *     an overflowing flex row's start in unreachable negative scroll space.
 */
describe("Tabs primitives — admin chip row contract", () => {
  it("forwards arbitrary data-* props to the DOM", () => {
    render(
      <Tabs value="content">
        <TabsList data-admin-tabs="">
          <TabsTrigger data-tab="content" value="content">
            Upload
          </TabsTrigger>
        </TabsList>
        <TabsContent value="content">body</TabsContent>
      </Tabs>,
    );

    const list = document.querySelector("[data-admin-tabs]");
    expect(list).not.toBeNull();
    expect(list!.querySelector('[data-tab="content"]')).not.toBeNull();
  });

  it("lets a consumer override justify-center (unreachable-scroll bug)", () => {
    render(
      <Tabs value="a">
        <TabsList data-admin-tabs="" className="flex overflow-x-auto justify-start">
          <TabsTrigger data-tab="a" value="a">
            A
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    const list = document.querySelector("[data-admin-tabs]")!;
    expect(list.className).toContain("justify-start");
    expect(list.className).not.toContain("justify-center");
  });

  it("keeps the trigger clickable and marks the active tab", () => {
    render(
      <Tabs value="content">
        <TabsList>
          <TabsTrigger data-tab="content" value="content">
            Upload
          </TabsTrigger>
          <TabsTrigger data-tab="other" value="other">
            Other
          </TabsTrigger>
        </TabsList>
      </Tabs>,
    );

    expect(screen.getByText("Upload").getAttribute("data-state")).toBe("active");
    expect(screen.getByText("Other").getAttribute("data-state")).toBe("inactive");
    expect(screen.getByText("Upload").getAttribute("aria-selected")).toBe("true");
  });
});
