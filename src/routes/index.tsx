import { createFileRoute, Link } from "@tanstack/react-router";
import { Target, ArrowRight } from "lucide-react";

// No head() here: the home route inherits title/description/og/twitter from
// __root.tsx, and ships no og:image so serve-time hosting can inject the
// project's social preview (explicit og:image or latest screenshot).
export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4">
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
          <Target className="h-8 w-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold text-foreground">Connect All Together</h1>
        <p className="text-muted-foreground">AI-powered outreach platform</p>
      </div>
      <Link
        id="go-to-target-intake"
        to="/intake"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
      >
        Open Target Intake Agent
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
