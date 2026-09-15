import "@testing-library/jest-dom/vitest";

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

// Mock ResizeObserver
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
window.ResizeObserver = ResizeObserverMock;

// ── Capacitor plugin mocks (per /skill:capacitor-testing) ──
import { vi } from "vitest";

vi.mock("@capacitor/core", () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
    getPlatform: vi.fn(() => "web"),
    isPluginAvailable: vi.fn(() => false),
  },
  registerPlugin: vi.fn(),
}));

vi.mock("@capacitor/app", () => ({
  App: {
    getInfo: vi.fn().mockResolvedValue({ version: "1.0.0", build: "1" }),
    getLaunchUrl: vi.fn().mockResolvedValue(null),
    addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
    exitApp: vi.fn(),
  },
}));

vi.mock("@capacitor/filesystem", () => ({
  Filesystem: { readFile: vi.fn(), writeFile: vi.fn(), deleteFile: vi.fn() },
  Directory: { Data: "DATA", Cache: "CACHE" },
  Encoding: { UTF8: "utf8" },
}));

vi.mock("@capacitor/splash-screen", () => ({
  SplashScreen: { hide: vi.fn(), show: vi.fn() },
}));

vi.mock("@capacitor/screen-orientation", () => ({
  ScreenOrientation: { lock: vi.fn(), unlock: vi.fn(), orientation: vi.fn().mockResolvedValue({ type: "portrait" }) },
}));

