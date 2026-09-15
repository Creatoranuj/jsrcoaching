import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import Footer from "../components/Landing/Footer";

vi.mock("../hooks/useSocialLinks", () => ({
  useSocialLinks: () => ({ data: [], isLoading: false }),
}));

describe("Footer social links", () => {
  it("renders YouTube link and does not render Telegram", () => {
    render(
      <BrowserRouter>
        <Footer />
      </BrowserRouter>
    );

    expect(screen.getByLabelText(/youtube/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/telegram/i)).not.toBeInTheDocument();
  });

  it("mentions board exam preparation in the footer", () => {
    render(
      <BrowserRouter>
        <Footer />
      </BrowserRouter>
    );

    expect(screen.getAllByText(/board exam/i).length).toBeGreaterThanOrEqual(1);
  });
});
