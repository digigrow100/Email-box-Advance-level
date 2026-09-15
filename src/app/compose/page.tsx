import { AppShell } from "@/components/app-shell";
import { ComposeForm } from "@/components/compose-form";
import { PageHeader } from "@/components/page-header";
import { listMailboxes } from "@/lib/data/repository";
export default async function ComposePage(){ const mailboxes=await listMailboxes(); return <AppShell><PageHeader title="Compose" description="Send or schedule an email from any connected mailbox."/><ComposeForm mailboxes={mailboxes.map(m=>({id:m.id,email:m.email}))}/></AppShell> }
