import { memo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ShieldAlert, Search, Filter, Download, CheckCircle, XCircle, Eye, Loader2, RefreshCw,
} from "lucide-react";
import { StatusBadge } from "./AdminBadges";
import type { PaymentStatusFilter, UnifiedPayment } from "../lib/adminFilters";
import type { PaymentTotals } from "../lib/adminStats";

// Payments tab of the admin dashboard, lifted verbatim out of Admin.tsx.
// Purely presentational: approve/reject/refund/screenshot side effects and the
// search + filter state stay in the page and arrive as props.

interface AdminPaymentsTabProps {
  payments: UnifiedPayment[];
  totalRevenue: number;
  totals: PaymentTotals;
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: PaymentStatusFilter;
  onStatusFilterChange: (value: PaymentStatusFilter) => void;
  refundingPayment: string | null;
  onExport: () => void;
  onApprove: (payment: UnifiedPayment) => void;
  onReject: (paymentId: number) => void;
  onRefund: (payment: UnifiedPayment) => void;
  onViewScreenshot: (payment: UnifiedPayment) => void;
}

function AdminPaymentsTabImpl({
  payments,
  totalRevenue,
  totals,
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  refundingPayment,
  onExport,
  onApprove,
  onReject,
  onRefund,
  onViewScreenshot,
}: AdminPaymentsTabProps) {
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Total Revenue</p>
          <p className="text-xl font-bold text-primary">₹{totalRevenue.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">All Time</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Today</p>
          <p className="text-xl font-bold text-emerald-600">₹{totals.todayAmount.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{totals.todayCount} txns</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">This Month</p>
          <p className="text-xl font-bold text-blue-600">₹{totals.monthAmount.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{totals.monthCount} txns</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Manual UPI</p>
          <p className="text-xl font-bold">₹{totals.manualAmount.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{totals.manualCount} approved</p>
        </Card>
        <Card className="p-3 text-center">
          <p className="text-xs text-muted-foreground">Razorpay</p>
          <p className="text-xl font-bold">₹{totals.razorpayAmount.toLocaleString()}</p>
          <p className="text-xs text-muted-foreground">{totals.razorpayCount} completed</p>
        </Card>
      </div>

      <Card className="border shadow-sm">
        <CardHeader className="bg-orange-50/50 border-b pb-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2 text-orange-700">
              <ShieldAlert className="h-5 w-5" /> All Payments ({payments.length})
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Search name, UTR, course..." value={search} onChange={(e) => onSearchChange(e.target.value)} className="pl-9" />
              </div>
              <Select value={statusFilter} onValueChange={(v: any) => onStatusFilterChange(v)}>
                <SelectTrigger className="w-[130px]"><Filter className="h-4 w-4 mr-2" /><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="refunded">Refunded</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={onExport}>
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <ScrollArea className="h-[500px] max-h-[calc(100dvh-260px)]">
            {payments.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3 opacity-20" />
                <p className="text-muted-foreground">No payments found.</p>
              </div>
            ) : (
              <div className="divide-y">
                {payments.map((req) => (
                  <div key={req._key} className="p-4 md:p-5 hover:bg-muted/30 transition-colors flex flex-col md:flex-row gap-4">
                    <div className="flex-1 space-y-2">
                      <div className="flex justify-between items-start gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-bold text-foreground">{req._course}</h3>
                            <StatusBadge status={req._status as string} />
                            <Badge variant={req._method === "razorpay" ? "default" : "outline"} className="text-xs">
                              {req._method === "razorpay" ? "💳 Razorpay" : "📱 UPI Manual"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            {req._method === "razorpay" ? `Order: ${req.razorpay_order_id?.slice(-8) || "—"}` : `${req._displayName} · ${req._email || "—"}`}
                          </p>
                        </div>
                        <Badge variant="outline" className="text-base px-3 py-1 shrink-0">₹{req._amount}</Badge>
                      </div>
                      {req._method === "upi" && (
                        <div className="bg-blue-50 dark:bg-blue-950/20 p-2 rounded-lg text-xs space-y-1 border border-blue-100 dark:border-blue-900">
                          <p className="flex justify-between"><span className="text-blue-600 font-medium">Sender:</span><span className="font-bold">{req.sender_name || "—"}</span></p>
                          <p className="flex justify-between"><span className="text-blue-600 font-medium">UTR:</span><span className="font-mono font-bold">{req.transaction_id || "—"}</span></p>
                        </div>
                      )}
                      {req._method === "razorpay" && req.razorpay_payment_id && (
                        <div className="bg-primary/5 p-2 rounded-lg text-xs border border-primary/10">
                          <p>Payment ID: <span className="font-mono">{req.razorpay_payment_id}</span></p>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">{new Date(req._date as string).toLocaleString("en-IN")}</p>
                    </div>
                    {req._method === "upi" && (
                      <div className="flex flex-col gap-2 min-w-[180px]">
                        {req.screenshot_url && (
                          <a href="#" onClick={(e) => { e.preventDefault(); onViewScreenshot(req); }}>
                            <Button variant="outline" className="w-full" size="sm"><Eye className="h-4 w-4 mr-2" />View Screenshot</Button>
                          </a>
                        )}
                        {req._status === "pending" && (
                          <div className="flex gap-2">
                            <Button size="sm" className="flex-1 bg-green-600 hover:bg-green-700 text-white" onClick={() => onApprove(req)}>
                              <CheckCircle className="h-4 w-4 mr-1" />Approve
                            </Button>
                            <Button size="sm" variant="destructive" className="flex-1" onClick={() => onReject(req.id)}>
                              <XCircle className="h-4 w-4 mr-1" />Reject
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                    {req._method === "razorpay" && req._status === "completed" && req.razorpay_payment_id && (
                      <div className="flex flex-col gap-2 min-w-[180px]">
                        <Button
                          size="sm"
                          variant="destructive"
                          className="w-full"
                          disabled={refundingPayment === req._key}
                          onClick={() => onRefund(req)}
                        >
                          {refundingPayment === req._key ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCw className="h-4 w-4 mr-1" />}
                          Refund
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </>
  );
}

export const AdminPaymentsTab = memo(AdminPaymentsTabImpl);
