import Link from "next/link";

type NavIconName = "dashboard" | "scan" | "trends" | "patterns" | "brief";

type NavItem = {
  href: string;
  label: string;
  icon: NavIconName;
};

const items: NavItem[] = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/scan", label: "Scan", icon: "scan" },
  { href: "/trends", label: "Trends", icon: "trends" },
  { href: "/patterns", label: "Patterns", icon: "patterns" },
  { href: "/brief", label: "Brief", icon: "brief" },
];

function NavIcon({ name }: { name: NavIconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 20 20",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.6,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  switch (name) {
    case "scan":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 5h14M3 10h14M3 15h8" />
          <rect x="13" y="12" width="5" height="5" rx="1" />
        </svg>
      );
    case "dashboard":
      return (
        <svg {...common} aria-hidden="true">
          <rect x="3" y="3" width="6" height="8" />
          <rect x="11" y="3" width="6" height="5" />
          <rect x="11" y="10" width="6" height="7" />
          <rect x="3" y="13" width="6" height="4" />
        </svg>
      );
    case "patterns":
      return (
        <svg {...common} aria-hidden="true">
          <circle cx="10" cy="10" r="2" />
          <circle cx="4" cy="5" r="1.5" />
          <circle cx="16" cy="5" r="1.5" />
          <circle cx="4" cy="15" r="1.5" />
          <circle cx="16" cy="15" r="1.5" />
          <path d="M10 10L4 5M10 10L16 5M10 10L4 15M10 10L16 15" />
        </svg>
      );
    case "brief":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M5 3h10v14l-5-3-5 3V3z" />
          <path d="M8 7h4M8 10h4" />
        </svg>
      );
    case "trends":
      return (
        <svg {...common} aria-hidden="true">
          <path d="M3 15L7 10l3 3 7-8" />
          <path d="M12 7h5v5" />
        </svg>
      );
  }
}

type SidebarNavProps = {
  activePath?: string;
};

export function SidebarNav({ activePath = "/" }: SidebarNavProps) {
  return (
    <aside className="lg:sticky lg:top-6">
      <div className="surface-card p-4">
        <div className="border-b border-slate-200 pb-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-sky-700">
            News Agg
          </p>
          <p className="mt-2 text-sm text-slate-600">
            Daily signals, weekly shifts, structural patterns.
          </p>
        </div>

        <nav className="mt-4 space-y-1">
          {items.map((item) => {
            const active =
              item.href === "/"
                ? activePath === "/"
                : activePath.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? "bg-sky-600 text-white shadow-sm"
                    : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <span
                  className={`grid h-8 w-8 place-items-center rounded-lg transition ${
                    active ? "bg-white/15 text-white" : "bg-slate-50 text-slate-500"
                  }`}
                >
                  <NavIcon name={item.icon} />
                </span>
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
