import { describe, it, expect } from "vitest";
import { buildUpiCheckoutConfig } from "@/utils/razorpay";

type Instrument = { method: string; flows: string[] };
const instruments = (mode: "test" | "live" | null): Instrument[] => {
  const display = buildUpiCheckoutConfig(mode).config.display as {
    blocks: { upi: { instruments: Instrument[] } };
  };
  return display.blocks.upi.instruments;
};

describe("buildUpiCheckoutConfig", () => {
  it("asks for intent + collect on live keys so UPI app tiles render", () => {
    expect(instruments("live").map((i) => i.flows[0])).toEqual(["intent", "collect"]);
  });

  it("asks for collect only in test mode — intent does not exist on test keys", () => {
    expect(instruments("test")).toEqual([{ method: "upi", flows: ["collect"] }]);
  });

  it("treats an unknown mode like live", () => {
    expect(instruments(null).length).toBe(2);
  });

  it("always pins the UPI block first and keeps the default blocks", () => {
    const display = buildUpiCheckoutConfig("test").config.display as {
      sequence: string[];
      preferences: { show_default_blocks: boolean };
    };
    expect(display.sequence).toEqual(["block.upi"]);
    expect(display.preferences.show_default_blocks).toBe(true);
  });

  it("keeps UPI enabled in the method map", () => {
    expect(buildUpiCheckoutConfig("live").method.upi).toBe(true);
    expect(buildUpiCheckoutConfig("live").remember_customer).toBe(true);
  });
});
