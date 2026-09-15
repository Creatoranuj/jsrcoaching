import { Badge } from "@/components/ui/badge";

// Small presentational badges shared by the users/teachers/payments tabs.
// Extracted from Admin.tsx so the colour/label mapping is testable on its own.

export function RoleBadge({ role }: { role: string | null }) {
  switch (role) {
    case "admin":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Admin</Badge>;
    case "teacher":
      return <Badge className="bg-blue-100 text-blue-700 border-blue-200">Teacher</Badge>;
    case "student":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Student</Badge>;
    default:
      return <Badge className="bg-gray-100 text-gray-700 border-gray-200">No Role</Badge>;
  }
}

export function StatusBadge({ status }: { status: string | null }) {
  switch (status?.toLowerCase()) {
    case "approved":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Approved</Badge>;
    case "completed":
      return <Badge className="bg-green-100 text-green-700 border-green-200">Completed</Badge>;
    case "rejected":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Rejected</Badge>;
    case "failed":
      return <Badge className="bg-red-100 text-red-700 border-red-200">Failed</Badge>;
    case "refunded":
      return <Badge className="bg-purple-100 text-purple-700 border-purple-200">Refunded ↩</Badge>;
    default:
      return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">Pending</Badge>;
  }
}
