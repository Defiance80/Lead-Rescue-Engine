import Link from "next/link";
import { LogOut, Plus } from "lucide-react";
import { requireUser, agentFirstName } from "@/lib/session";
import { db } from "@/lib/db";
import { openIssueCount, priorityLane, safetyNetCount } from "@/lib/queries";
import { Logo } from "@/components/logo";
import { MobileNav, Sidebar, SidebarScroll } from "@/components/nav";
import { Avatar } from "@/components/ui";
import { signOutAction } from "../actions";
import { Tour } from "@/components/tour";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [priority, safety, rescue, inbox] = await Promise.all([
    priorityLane(user.id, 99).then((l) => l.length),
    safetyNetCount(user.id),
    openIssueCount(user.id),
    db.inboxItem.count({ where: { userId: user.id, status: { in: ["ready", "held"] } } }),
  ]);
  const counts = { priority, safety, rescue, inbox };
  const name = agentFirstName(user);

  return (
    <div className="lg:pl-72">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden h-dvh w-72 border-r border-white/[0.06] bg-ink-900/95 backdrop-blur-xl lg:block">
        <SidebarScroll>
        <Link href="/today" className="mb-6 block px-2 short:mb-3">
          <Logo />
        </Link>
        <Sidebar counts={counts} />
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 short:mt-3 short:p-2">
          <Avatar first={name} size="sm" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-white">{user.displayName || user.name || name}</div>
            <div className="truncate text-xs text-white/60">{user.email}</div>
          </div>
          <form action={signOutAction}>
            <button className="btn-ghost btn-sm" title="Sign out" aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
        </SidebarScroll>
      </aside>

      {/* Mobile header */}
      <div className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-950/85 px-4 pb-3 pt-3 backdrop-blur-xl lg:hidden">
        <div className="mb-3 flex items-center justify-between">
          <Link href="/today"><Logo /></Link>
          <div className="flex items-center gap-1">
            <Link href="/leads/new" data-tour="mobile-add-lead" className="btn-primary btn-sm" aria-label="Add a lead"><Plus className="h-4 w-4" /> Lead</Link>
            <form action={signOutAction}>
              <button className="btn-ghost btn-sm" aria-label="Sign out"><LogOut className="h-4 w-4" /></button>
            </form>
          </div>
        </div>
        <MobileNav counts={counts} />
      </div>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-10 lg:py-10">{children}</main>
      <Tour />
    </div>
  );
}
