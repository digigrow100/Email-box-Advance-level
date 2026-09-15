import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ToneProfileForm } from "@/components/tone-profile-form";
import { AiSettingsForm } from "@/components/ai-settings-form";
import { getAiSettings, listToneProfiles } from "@/lib/data/repository";

export default async function AIPage() {
  const [tones, settings] = await Promise.all([listToneProfiles(), getAiSettings()]);
  return <AppShell>
    <PageHeader title="AI & tone" description="Create replies that sound like you, with strict automation controls."/>
    <div className="grid gap-6 xl:grid-cols-[1.2fr_.8fr]">
      <div className="space-y-6"><ToneProfileForm/><AiSettingsForm initial={settings}/></div>
      <aside className="card h-fit p-5">
        <h2 className="font-bold">Saved tone profiles</h2>
        <div className="mt-4 space-y-3">{tones.map((tone: any) => <div key={tone.id} className="rounded-xl border border-slate-200 p-4"><div className="flex justify-between gap-2"><p className="font-semibold">{tone.name}</p>{tone.is_default && <span className="text-xs font-semibold text-indigo-600">Default</span>}</div><p className="mt-2 text-xs leading-5 text-slate-500">{tone.instructions}</p></div>)}</div>
        <div className="mt-5 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">Start in draft mode. Only enable auto-send for narrow, low-risk rules after testing your tone and conditions.</div>
      </aside>
    </div>
  </AppShell>;
}
