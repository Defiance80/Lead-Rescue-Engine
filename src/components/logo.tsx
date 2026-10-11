export function LogoMark({ className = "h-9 w-9" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="lr-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5a36" />
          <stop offset="1" stopColor="#f43f5e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="#121a2e" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="url(#lr-g)" strokeWidth="8" />
      <circle cx="32" cy="32" r="18" fill="none" stroke="#fff" strokeWidth="8" strokeDasharray="9 19.3" strokeDashoffset="4.5" opacity=".92" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className="font-display text-[15px] font-bold tracking-tight text-white">Lead Rescue</div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ember-400">Engine</div>
      </div>
    </div>
  );
}
