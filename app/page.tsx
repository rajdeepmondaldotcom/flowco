import Link from "next/link";

const ROLES = [
  {
    href: "/admin",
    label: "Admin",
    title: "Approver console",
    blurb: "Run the assistant on the queue. See the proof. Make the call.",
    kbd: "A",
  },
  {
    href: "/submit",
    label: "Employee",
    title: "Submit an expense",
    blurb: "Chat or a quick form. Attach a photo or PDF. Done in under a minute.",
    kbd: "E",
  },
];

export default function RoleSelect() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 py-12">
      <header className="mb-10 flex flex-col items-center text-center">
        <div className="mb-4 flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-bold text-white">
            F
          </span>
          <span className="text-xl font-semibold tracking-tight text-ink">FlowCo</span>
          <span className="text-sm text-ink-faint">Approvals Triage</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Who are you?</h1>
        <p className="mt-2 max-w-md text-sm text-ink-soft">
          The assistant does the digging. The person makes the call.
        </p>
      </header>

      <nav aria-label="Choose your role" className="grid w-full max-w-2xl gap-4 sm:grid-cols-2">
        {ROLES.map((role) => (
          <Link
            key={role.href}
            href={role.href}
            className="group rounded-2xl border border-line bg-surface p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-accent hover:shadow-md focus-visible:border-accent motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="rounded-full border border-line px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint group-hover:border-accent group-hover:text-accent">
                {role.label}
              </span>
              <span aria-hidden className="text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-accent motion-reduce:transition-none">
                →
              </span>
            </div>
            <h2 className="text-lg font-semibold text-ink">{role.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{role.blurb}</p>
          </Link>
        ))}
      </nav>

      <footer className="mt-10 text-center text-xs text-ink-faint">
        41 seeded expenses from a team offsite in Goa and a Singapore conference · rupees and Singapore dollars, reimbursed in USD
      </footer>
    </main>
  );
}
