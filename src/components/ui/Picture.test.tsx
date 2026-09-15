import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Picture } from "./Picture";

describe("Picture", () => {
  it("renders AVIF then WebP source in that order, with <img> fallback", () => {
    const { container } = render(
      <Picture
        srcAvif="/x.avif"
        srcWebp="/x.webp"
        srcFallback="/x.png"
        width={100}
        height={50}
        alt="demo"
      />
    );
    const picture = container.querySelector("picture")!;
    const sources = picture.querySelectorAll("source");
    expect(sources).toHaveLength(2);
    expect(sources[0].getAttribute("type")).toBe("image/avif");
    expect(sources[0].getAttribute("srcset")).toBe("/x.avif");
    expect(sources[1].getAttribute("type")).toBe("image/webp");

    const img = picture.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/x.png");
    expect(img.getAttribute("alt")).toBe("demo");
    expect(img.getAttribute("width")).toBe("100");
    expect(img.getAttribute("height")).toBe("50");
    expect(img.getAttribute("loading")).toBe("lazy");
  });

  it("omits AVIF source when srcAvif is not provided", () => {
    const { container } = render(
      <Picture srcWebp="/x.webp" srcFallback="/x.png" width={10} height={10} alt="" />
    );
    const sources = container.querySelectorAll("source");
    expect(sources).toHaveLength(1);
    expect(sources[0].getAttribute("type")).toBe("image/webp");
  });

  it("priority sets eager loading + high fetchpriority", () => {
    const { container } = render(
      <Picture srcFallback="/x.png" width={10} height={10} alt="hero" priority />
    );
    const img = container.querySelector("img")!;
    expect(img.getAttribute("loading")).toBe("eager");
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });
});
