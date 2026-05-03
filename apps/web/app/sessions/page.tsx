import type { Metadata } from "next";
import { SessionsIndexShell } from "./sessions-index-shell";

export const metadata: Metadata = {
  title: "Tasks",
  description: "View and manage your tasks.",
};

export default function SessionsPage() {
  return <SessionsIndexShell />;
}
