export type MailboxProvider = "gmail" | "custom";
export type MailboxStatus = "healthy" | "warning" | "paused" | "error";

export type Mailbox = {
  id: string;
  name: string;
  email: string;
  provider: MailboxProvider;
  status: MailboxStatus;
  dailyLimit: number;
  sentToday: number;
  rampDay: number;
  replyRate: number;
  lastSync: string;
};

export type Campaign = {
  id: string;
  name: string;
  status: "draft" | "scheduled" | "running" | "paused" | "completed";
  mailbox: string;
  contacts: number;
  sent: number;
  replies: number;
  scheduledFor: string;
};

export type Contact = {
  id: string;
  name: string;
  email: string;
  company: string;
  status: "active" | "replied" | "bounced" | "unsubscribed" | "complained";
};

export type ActivityItem = {
  id: string;
  type: "sent" | "reply" | "bounce" | "connected" | "warning";
  title: string;
  detail: string;
  time: string;
};
