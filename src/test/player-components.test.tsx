import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PlayerTopOverlay } from "@/components/video/PlayerTopOverlay";
import { PlayerBrandMasks } from "@/components/video/PlayerBrandMasks";
import { PlayerCenterControls } from "@/components/video/PlayerCenterControls";
import { PlayerSettingsMenu } from "@/components/video/PlayerSettingsMenu";

describe("PlayerTopOverlay", () => {
  const base = {
    showControls: true,
    isFakeFullscreen: false,
    title: "Chapter 1",
    subtitle: "Introduction",
    onExitFullscreen: vi.fn(),
    onBackgroundClick: vi.fn(),
  };

  it("title aur subtitle dikhata hai", () => {
    render(<PlayerTopOverlay {...base} />);
    expect(screen.getByText("Chapter 1")).toBeTruthy();
    expect(screen.getByText("Introduction")).toBeTruthy();
  });

  it("controls band hone par invisible hota hai", () => {
    render(<PlayerTopOverlay {...base} showControls={false} />);
    const overlay = screen.getByText("Chapter 1").parentElement?.parentElement;
    expect(overlay?.className).toMatch(/opacity-0/);
  });

  it("fake fullscreen mein exit button dikhata hai", () => {
    render(<PlayerTopOverlay {...base} isFakeFullscreen />);
    expect(screen.getByLabelText("Exit fullscreen")).toBeTruthy();
  });

  it("exit button click par callback milta hai", () => {
    const onExitFullscreen = vi.fn();
    render(<PlayerTopOverlay {...base} isFakeFullscreen onExitFullscreen={onExitFullscreen} />);
    fireEvent.click(screen.getByLabelText("Exit fullscreen"));
    expect(onExitFullscreen).toHaveBeenCalled();
  });

  it("background click parent tak jaata hai", () => {
    const onBackgroundClick = vi.fn();
    const { container } = render(<PlayerTopOverlay {...base} onBackgroundClick={onBackgroundClick} />);
    const overlay = container.firstChild as HTMLElement;
    fireEvent.click(overlay);
    expect(onBackgroundClick).toHaveBeenCalled();
  });
});

describe("PlayerBrandMasks", () => {
  it("infinity logo dikhata hai jab enabled ho", () => {
    const { container } = render(
      <PlayerBrandMasks
        showInfinityLogo
        showYoutubeMask={false}
        isLandscapeRotation={false}
        isFakeFullscreen={false}
      />
    );
    expect(container.querySelector("img")).toBeTruthy();
  });

  it("infinity logo band hone par kuch nahi dikhata", () => {
    const { container } = render(
      <PlayerBrandMasks
        showInfinityLogo={false}
        showYoutubeMask={false}
        isLandscapeRotation={false}
        isFakeFullscreen={false}
      />
    );
    expect(container.innerHTML).toBe("");
  });

  it("youtube mask dikhata hai jab enabled ho", () => {
    const { container } = render(
      <PlayerBrandMasks
        showInfinityLogo={false}
        showYoutubeMask
        isLandscapeRotation={false}
        isFakeFullscreen={false}
      />
    );
    expect(container.textContent).toContain("Bharat");
  });
});

describe("PlayerCenterControls", () => {
  const base = {
    showControls: true,
    isPlaying: false,
    isLandscapeRotation: false,
    isFakeFullscreen: false,
    isPortrait: true,
    onTogglePlay: vi.fn(),
    onSkipBackward: vi.fn(),
    onSkipForward: vi.fn(),
    onShowControls: vi.fn(),
  };

  it("play button dikhata hai jab paused ho", () => {
    render(<PlayerCenterControls {...base} />);
    expect(screen.getByLabelText("Play/Pause")).toBeTruthy();
    expect(screen.getByAltText("Play/Pause")).toBeTruthy();
  });

  it("pause button dikhata hai jab playing ho", () => {
    render(<PlayerCenterControls {...base} isPlaying />);
    expect(screen.getByLabelText("Play/Pause")).toBeTruthy();
    expect(screen.queryByAltText("Play/Pause")).toBeNull();
  });

  it("skip backward click callback deta hai", () => {
    const onSkipBackward = vi.fn();
    render(<PlayerCenterControls {...base} onSkipBackward={onSkipBackward} />);
    fireEvent.click(screen.getByLabelText("Backward 10s"));
    expect(onSkipBackward).toHaveBeenCalled();
    expect(base.onShowControls).toHaveBeenCalled();
  });

  it("skip forward click callback deta hai", () => {
    const onSkipForward = vi.fn();
    render(<PlayerCenterControls {...base} onSkipForward={onSkipForward} />);
    fireEvent.click(screen.getByLabelText("Forward 10s"));
    expect(onSkipForward).toHaveBeenCalled();
  });

  it("play/pause click toggle callback deta hai", () => {
    const onTogglePlay = vi.fn();
    render(<PlayerCenterControls {...base} onTogglePlay={onTogglePlay} />);
    fireEvent.click(screen.getByLabelText("Play/Pause"));
    expect(onTogglePlay).toHaveBeenCalled();
    expect(base.onShowControls).toHaveBeenLastCalledWith(5000);
  });

  it("controls hide hone par play button invisible hota hai", () => {
    const { container } = render(<PlayerCenterControls {...base} showControls={false} />);
    const playButton = container.querySelector('[aria-label="Play/Pause"]');
    expect(playButton?.className).toMatch(/opacity-0/);
  });
});

describe("PlayerSettingsMenu", () => {
  const base = {
    showControls: true,
    showSpeedMenu: false,
    playbackSpeed: 1,
    onToggleMenu: vi.fn(),
    onSetSpeed: vi.fn(),
  };

  it("gear button dikhata hai", () => {
    render(<PlayerSettingsMenu {...base} />);
    expect(screen.getByLabelText("Playback speed and quality")).toBeTruthy();
  });

  it("showControls band hone par kuch nahi dikhata", () => {
    const { container } = render(<PlayerSettingsMenu {...base} showControls={false} />);
    expect(container.firstChild).toBeNull();
  });

  it("gear click par toggle callback milta hai", () => {
    const onToggleMenu = vi.fn();
    render(<PlayerSettingsMenu {...base} onToggleMenu={onToggleMenu} />);
    fireEvent.click(screen.getByLabelText("Playback speed and quality"));
    expect(onToggleMenu).toHaveBeenCalled();
  });

  it("speed menu open hone par saare options dikhate hain", () => {
    render(<PlayerSettingsMenu {...base} showSpeedMenu />);
    [0.75, 1, 1.25, 1.5, 2, 3].forEach((speed) => {
      expect(screen.getByText(`${speed}x`)).toBeTruthy();
    });
  });

  it("speed option click par setSpeed callback milta hai", () => {
    const onSetSpeed = vi.fn();
    render(<PlayerSettingsMenu {...base} showSpeedMenu onSetSpeed={onSetSpeed} />);
    fireEvent.click(screen.getByText("1.5x"));
    expect(onSetSpeed).toHaveBeenCalledWith(1.5);
  });

  it("active speed highlight hota hai", () => {
    render(<PlayerSettingsMenu {...base} showSpeedMenu playbackSpeed={1.5} />);
    const active = screen.getByText("1.5x");
    expect(active.className).toMatch(/text-blue-400/);
  });
});
