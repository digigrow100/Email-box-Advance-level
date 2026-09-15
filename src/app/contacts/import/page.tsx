import { AppShell } from "@/components/app-shell";
import { CsvImportForm } from "@/components/csv-import-form";
import { PageHeader } from "@/components/page-header";
export default function ImportContactsPage() { return <AppShell><PageHeader title="Import contacts" description="Add business contacts from CSV. Duplicate and invalid rows are filtered." /><CsvImportForm /></AppShell>; }
