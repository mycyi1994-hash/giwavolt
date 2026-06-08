"use client";

import { usePathname } from "next/navigation";

// Replays a subtle fade/slide on every route change inside the terminal.
export default function Fade({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div key={pathname} className="h-full animate-rise">
      {children}
    </div>
  );
}
