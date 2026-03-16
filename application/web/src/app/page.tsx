import { HealthCheck } from "@/components/health-check";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900">
      <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-16">
        <header className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Stripe Meter POC
          </p>
          <h1 className="text-3xl font-semibold">Foundation Checkpoint</h1>
          <p className="text-zinc-600">
            Next.js uses React Query to call NestJS directly. This is the base pattern for upcoming auth and billing flows.
          </p>
        </header>
        <div className="flex gap-3">
          <Link
            className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
            href="/login"
          >
            Go To Login
          </Link>
        </div>
        <HealthCheck />
      </main>
    </div>
  );
}
