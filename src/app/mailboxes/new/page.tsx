import { AppShell } from "@/components/app-shell";
import { ConnectMailboxForm } from "@/components/connect-mailbox-form";
import { PageHeader } from "@/components/page-header";

export default function NewMailboxPage() {
  return <AppShell><PageHeader title="Connect mailbox" description="Add Gmail with OAuth or a professional mailbox using IMAP and SMTP." /><ConnectMailboxForm /></AppShell>;
}
