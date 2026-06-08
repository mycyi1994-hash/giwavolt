import TopNav from "@/components/shell/TopNav";
import Fade from "@/components/shell/Fade";

export default function TerminalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col">
      <TopNav />
      <main className="min-h-0 flex-1">
        <Fade>{children}</Fade>
      </main>
    </div>
  );
}
