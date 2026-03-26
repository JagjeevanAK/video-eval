import type { Metadata } from "next";

import Dashboard from "@/screens/Dashboard";

export const metadata: Metadata = {
  title: "Dashboard | VidEval",
};

export default function DashboardPage() {
  return <Dashboard />;
}
