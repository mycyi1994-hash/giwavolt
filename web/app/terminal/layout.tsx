import TopNav from "@/components/shell/TopNav";

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <TopNav />
      <main className="min-h-0 flex-1">{children}</main>
    </div>
  );
}
