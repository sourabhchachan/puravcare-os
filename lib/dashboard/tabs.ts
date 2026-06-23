import type { ComponentType } from "react";

import type { UserRole } from "@/lib/auth/types";
import {
  IconAttendance,
  IconBill,
  IconCashbook,
  IconHome,
  IconIndent,
  IconInventory,
  IconInvoice,
  IconNotice,
  IconPending,
  IconPatients,
  IconPulse,
  IconTasks,
  IconTruck,
  IconVendors,
} from "@/components/dashboard/nav-icons";

export type DashboardTab = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
};

export function getDashboardTabs(role: UserRole): DashboardTab[] {
  switch (role) {
    case "ceo":
      return [
        { href: "/dashboard", label: "Pulse", icon: IconPulse },
        { href: "/dashboard/patients", label: "Patients", icon: IconPatients },
        { href: "/dashboard/tasks", label: "Tasks", icon: IconTasks },
        { href: "/dashboard/cashbook", label: "Cashbook", icon: IconCashbook },
        { href: "/dashboard/notices", label: "Notices", icon: IconNotice },
        { href: "/dashboard/indents", label: "Indent", icon: IconIndent },
        { href: "/dashboard/master-bill", label: "Master Bill", icon: IconBill },
        { href: "/dashboard/attendance", label: "Attendance", icon: IconAttendance },
        { href: "/dashboard/inventory", label: "Inventory", icon: IconInventory },
      ];
    case "ops":
      return [
        { href: "/dashboard", label: "Home", icon: IconHome },
        { href: "/dashboard/patients", label: "Patients", icon: IconPatients },
        { href: "/dashboard/tasks", label: "Tasks", icon: IconTasks },
        { href: "/dashboard/cashbook", label: "Cashbook", icon: IconCashbook },
        { href: "/dashboard/notices", label: "Notices", icon: IconNotice },
        { href: "/dashboard/indents", label: "Indent", icon: IconIndent },
        { href: "/dashboard/vendors", label: "Vendors", icon: IconVendors },
        { href: "/dashboard/attendance", label: "Attendance", icon: IconAttendance },
        { href: "/dashboard/inventory", label: "Inventory", icon: IconInventory },
      ];
    case "staff":
      return [
        { href: "/dashboard", label: "Home", icon: IconHome },
        { href: "/dashboard/tasks", label: "Tasks", icon: IconTasks },
        { href: "/dashboard/cashbook", label: "Cashbook", icon: IconCashbook },
        { href: "/dashboard/notices", label: "Notices", icon: IconNotice },
        { href: "/dashboard/indents", label: "Indent", icon: IconIndent },
      ];
    case "vendor":
      return [
        { href: "/dashboard", label: "Home", icon: IconHome },
        { href: "/dashboard/notices", label: "Notices", icon: IconNotice },
        { href: "/dashboard/tasks", label: "Tasks", icon: IconTasks },
        { href: "/dashboard/pending", label: "Pending", icon: IconPending },
        { href: "/dashboard/dispatched", label: "Dispatched", icon: IconTruck },
        { href: "/dashboard/invoices", label: "Invoices", icon: IconInvoice },
        { href: "/dashboard/inventory", label: "Inventory", icon: IconInventory },
      ];
    default:
      return [];
  }
}

export function isTabActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
