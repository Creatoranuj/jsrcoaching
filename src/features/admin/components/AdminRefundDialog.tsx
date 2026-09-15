import { memo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";

// Refund confirmation dialog, lifted verbatim out of Admin.tsx.
// The irreversible-action safety flow is preserved exactly: optional partial
// amount, partial-refund warning, and an exact uppercase "REFUND" confirmation
// before the destructive button unlocks. The actual refund call stays in the page.

interface AdminRefundDialogProps {
  payment: any | null;
  confirmText: string;
  onConfirmTextChange: (value: string) => void;
  amountText: string;
  onAmountTextChange: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}

function AdminRefundDialogImpl({
  payment,
  confirmText,
  onConfirmTextChange,
  amountText,
  onAmountTextChange,
  onCancel,
  onConfirm,
}: AdminRefundDialogProps) {
  return (
    <Dialog open={!!payment} onOpenChange={(open) => { if (!open) onCancel(); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-destructive">⚠️ Confirm Refund</DialogTitle>
          <DialogDescription>
            You are about to refund <strong>₹{payment?._amount}</strong> for course <strong>"{payment?._course}"</strong>.
            This will revoke the student's course access immediately. This action cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Refund amount (₹) — leave blank for a full refund</Label>
          <Input
            type="number"
            min="1"
            step="1"
            inputMode="decimal"
            value={amountText}
            onChange={(e) => onAmountTextChange(e.target.value)}
            placeholder={`Full refund (₹${payment?._amount ?? ""})`}
          />
          <p className="text-xs text-muted-foreground">
            A partial refund does <strong>not</strong> remove the student's course access — only a full refund does.
          </p>
        </div>
        <div className="space-y-2 py-2">
          <Label>Type <span className="font-bold text-destructive">REFUND</span> to confirm:</Label>
          <Input
            value={confirmText}
            onChange={(e) => onConfirmTextChange(e.target.value)}
            placeholder="Type REFUND here"
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onCancel}>Cancel</Button>
          <Button variant="destructive" disabled={confirmText !== "REFUND"} onClick={onConfirm}>
            Confirm Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const AdminRefundDialog = memo(AdminRefundDialogImpl);
