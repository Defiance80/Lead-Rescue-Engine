import Link from "next/link";
import { Compass } from "lucide-react";

export default function NotFound() {
  return (
    <main className="grid min-h-[70dvh] place-items-center px-4 text-center">
      <div>
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-cyan-400/10 text-cyan-300">
          <Compass className="h-7 w-7" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold text-white">Can&apos;t find that one</h1>
        <p className="mt-1 text-slate-400">It may have been removed, or the link is off by a character.</p>
        <Link href="/today" className="btn-primary mt-6">Back to Today</Link>
      </div>
    </main>
  );
}
