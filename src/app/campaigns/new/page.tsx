import { AppShell } from "@/components/app-shell";
import { CampaignForm } from "@/components/campaign-form";
import { PageHeader } from "@/components/page-header";
import { listContacts, listMailboxes } from "@/lib/data/repository";

export default async function NewCampaignPage() {
  const [mailboxes, contacts] = await Promise.all([listMailboxes(), listContacts()]);
  return <AppShell><PageHeader title="New campaign" description="Choose a mailbox, contacts and sending window. Daily mailbox limits remain enforced." /><CampaignForm mailboxes={mailboxes} contacts={contacts} /></AppShell>;
}
