import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { TemplateForm } from "@/components/template-form";
export default function NewTemplatePage() { return <AppShell><PageHeader title="New template" description="Create reusable email copy with personalization variables." /><TemplateForm /></AppShell>; }
