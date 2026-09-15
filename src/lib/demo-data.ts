import type { ActivityItem, Campaign, Contact, Mailbox } from "@/lib/types";

export const demoMailboxes: Mailbox[] = [
  {
    id: "mb-1",
    name: "Hamza",
    email: "hamza@northstaragency.com",
    provider: "custom",
    status: "healthy",
    dailyLimit: 28,
    sentToday: 16,
    rampDay: 12,
    replyRate: 8.4,
    lastSync: "2 min ago",
  },
  {
    id: "mb-2",
    name: "Sales",
    email: "sales@northstaragency.com",
    provider: "custom",
    status: "healthy",
    dailyLimit: 22,
    sentToday: 11,
    rampDay: 8,
    replyRate: 6.8,
    lastSync: "4 min ago",
  },
  {
    id: "mb-3",
    name: "Gmail Outreach",
    email: "northstar.outreach@gmail.com",
    provider: "gmail",
    status: "warning",
    dailyLimit: 15,
    sentToday: 13,
    rampDay: 5,
    replyRate: 4.1,
    lastSync: "7 min ago",
  },
  {
    id: "mb-4",
    name: "Partnerships",
    email: "partnerships@northstaragency.com",
    provider: "custom",
    status: "paused",
    dailyLimit: 20,
    sentToday: 0,
    rampDay: 3,
    replyRate: 0,
    lastSync: "1 hr ago",
  },
];

export const demoCampaigns: Campaign[] = [
  {
    id: "c-1",
    name: "US Local Agencies — September",
    status: "running",
    mailbox: "hamza@northstaragency.com",
    contacts: 180,
    sent: 96,
    replies: 11,
    scheduledFor: "Weekdays · 9:30 AM–2:00 PM ET",
  },
  {
    id: "c-2",
    name: "Web Design Follow-up",
    status: "scheduled",
    mailbox: "sales@northstaragency.com",
    contacts: 84,
    sent: 0,
    replies: 0,
    scheduledFor: "Tomorrow · 10:00 AM ET",
  },
  {
    id: "c-3",
    name: "Old Leads Re-engagement",
    status: "paused",
    mailbox: "northstar.outreach@gmail.com",
    contacts: 52,
    sent: 21,
    replies: 2,
    scheduledFor: "Paused manually",
  },
];

export const demoContacts: Contact[] = [
  { id: "p-1", name: "Olivia Carter", email: "olivia@example.org", company: "Carter Studio", status: "active" },
  { id: "p-2", name: "Daniel Brooks", email: "daniel@example.org", company: "Brooks Dental", status: "replied" },
  { id: "p-3", name: "Sophia Reed", email: "sophia@example.org", company: "Reed & Co", status: "active" },
  { id: "p-4", name: "Marcus Hill", email: "marcus@example.org", company: "Hill Roofing", status: "bounced" },
  { id: "p-5", name: "Emma Lewis", email: "emma@example.org", company: "Lewis Legal", status: "unsubscribed" },
];

export const demoActivity: ActivityItem[] = [
  { id: "a-1", type: "reply", title: "Reply received", detail: "Daniel Brooks replied to US Local Agencies — September", time: "4 min ago" },
  { id: "a-2", type: "sent", title: "Batch completed", detail: "12 messages sent from hamza@northstaragency.com", time: "18 min ago" },
  { id: "a-3", type: "warning", title: "Ramp limit nearly reached", detail: "northstar.outreach@gmail.com has 2 sends remaining today", time: "31 min ago" },
  { id: "a-4", type: "connected", title: "Mailbox synced", detail: "sales@northstaragency.com IMAP sync completed", time: "48 min ago" },
  { id: "a-5", type: "bounce", title: "Recipient bounced", detail: "A hard bounce was suppressed automatically", time: "1 hr ago" },
];
