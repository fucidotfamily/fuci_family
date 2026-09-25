export function Logo({ className = "h-7 w-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true">
      <g fill="none" stroke="var(--ink)" strokeWidth="4.5" strokeLinecap="round">
        <path d="M32 60V38" />
        <path d="M32 38c0-6-8-9-9-17" />
        <path d="M32 38c0-6 8-9 9-17" />
        <path d="M23 21c-1-5-5-7-6-11" />
        <path d="M23 21c1-5 4-7 5-11" />
        <path d="M41 21c-1-5-4-7-5-11" />
        <path d="M41 21c1-5 5-7 6-11" />
      </g>
      <g fill="var(--ink)">
        <circle cx="17" cy="9" r="3.2" />
        <circle cx="28" cy="9" r="3.2" />
        <circle cx="36" cy="9" r="3.2" />
        <circle cx="47" cy="9" r="3.2" />
      </g>
    </svg>
  );
}
