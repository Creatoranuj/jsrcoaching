import { HardDrive, ShieldCheck } from "lucide-react";
import { Button } from "../../ui/button";

interface Props {
  onAllow: () => void;
}

/**
 * Friendly first-use prompt. We don't actually need a phone permission for
 * app-private storage on modern Android/iOS — Capacitor `Directory.Data` is
 * sandboxed and writable without user-facing grants. The button just unlocks
 * the Library UI on first use so it doesn't open accidentally.
 */
export default function PersonalLibraryGate({ onAllow }: Props) {
  return (
    <div className="rounded-2xl border bg-card p-6 text-center space-y-4">
      <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center">
        <HardDrive className="h-7 w-7 text-primary" />
      </div>
      <div>
        <h3 className="text-base font-semibold text-foreground">
          Set up your private Library
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Save PDFs inside the app, organise them with nested folders, and read
          them anytime — even offline. Nothing leaves your device.
        </p>
      </div>
      <div className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5" />
        Private to this device · removed if you uninstall the app
      </div>
      <Button onClick={onAllow} className="w-full">
        Enable My Library
      </Button>
    </div>
  );
}
