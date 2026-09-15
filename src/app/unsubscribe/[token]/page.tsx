export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <main className="grid min-h-screen place-items-center p-4"><section className="card w-full max-w-lg p-7 text-center"><h1 className="text-2xl font-bold">Unsubscribe</h1><p className="mt-3 text-sm leading-6 text-slate-500">Click below to stop future campaign emails sent through this MailPilot workspace.</p><form action={`/api/unsubscribe/${encodeURIComponent(token)}`} method="post"><button className="mt-6 rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">Unsubscribe this address</button></form></section></main>;
}
