import type { ReactNode } from "react";
import { requireRole } from "@/server/auth/guards";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requireRole("ADMIN_EMPRESA", "SUPER_ADMIN");
  return children;
}
