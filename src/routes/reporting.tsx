import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { createServerFn } from "@tanstack/react-start";
import { getReportingMetrics, ReportingMetrics } from "../lib/reporting";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Loader2,
  Users,
  MessageSquare,
  Send,
  Calendar,
  CheckCircle,
  BarChart3,
} from "lucide-react";

// Server function to fetch the metrics
const fetchMetricsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { auth } = await import("../lib/auth");

  const request = getRequest();
  let session = null;
  if (request) {
    session = await auth.api.getSession({ headers: request.headers });
  }

  if (!session?.user) {
    throw new Error("Unauthorized: Please log in to view analytics.");
  }

  // Currently we use session.user.id as the workspaceId, matching the pattern in intake.tsx.
  // Note: A true multi-tenant workspace membership check (e.g. querying workspaceMembers) is missing
  // in both intake.tsx and here, because the workspace selection system is not yet built.
  const workspaceId = session.user.id;

  try {
    const metrics = await getReportingMetrics({ workspaceId });
    return metrics;
  } catch (error: unknown) {
    const e = error as Error;
    throw new Error(`Failed to load metrics: ${e.message}`);
  }
});

export const Route = createFileRoute("/reporting")({
  component: ReportingPage,
});

function MetricCard({
  title,
  value,
  icon: Icon,
  description,
}: {
  title: string;
  value: number | string | null;
  icon: React.ElementType;
  description?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">
          {value === null ? (
            <span className="text-sm text-muted-foreground font-normal">Not available yet</span>
          ) : (
            value
          )}
        </div>
        {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
      </CardContent>
    </Card>
  );
}

function ReportingPage() {
  const [metrics, setMetrics] = useState<ReportingMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchMetricsFn();
        setMetrics(data);
      } catch (err: unknown) {
        const e = err as Error;
        setError(e.message || "An unexpected error occurred");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  const replyRate = metrics?.messagesSent
    ? Math.round((metrics.repliesReceived / metrics.messagesSent) * 100)
    : 0;

  return (
    <div className="mx-auto max-w-6xl p-6 space-y-8 mt-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground flex items-center gap-2">
          <BarChart3 className="h-8 w-8 text-primary" />
          Reporting & Analytics
        </h1>
        <p className="mt-2 text-muted-foreground">
          Track the performance of your outreach campaigns and lead generation efforts.
        </p>
      </div>

      {loading && (
        <div className="flex h-64 items-center justify-center rounded-xl border border-dashed">
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
            <p>Loading your analytics...</p>
          </div>
        </div>
      )}

      {error && !loading && (
        <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-6 text-destructive">
          <h3 className="font-semibold mb-1">Failed to load reporting data</h3>
          <p className="text-sm opacity-90">{error}</p>
        </div>
      )}

      {!loading && !error && metrics && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            title="Leads Discovered"
            value={metrics.leadsDiscovered}
            icon={Users}
            description="Total leads matching profiles"
          />
          <MetricCard
            title="Leads Researched"
            value={metrics.leadsResearched}
            icon={Users}
            description="Integration not available yet"
          />
          <MetricCard
            title="Messages Sent"
            value={metrics.messagesSent}
            icon={Send}
            description="Total outbound outreach messages"
          />
          <MetricCard
            title="Replies Received"
            value={metrics.repliesReceived}
            icon={MessageSquare}
            description={`${replyRate}% overall reply rate`}
          />
          <MetricCard
            title="Follow-up Activity"
            value={metrics.followUpTasksCompleted}
            icon={CheckCircle}
            description="Completed automated follow-up tasks"
          />
          <MetricCard
            title="Awaiting Qualification"
            value={metrics.awaitingQualification}
            icon={Users}
            description="Leads awaiting Issue #8 agent"
          />
          <MetricCard
            title="Meetings Booked"
            value={metrics.meetingsBooked}
            icon={Calendar}
            description="Integration not available yet"
          />
        </div>
      )}

      {!loading && !error && metrics && metrics.leadsDiscovered === 0 && (
        <div className="rounded-xl border bg-card p-8 text-center shadow-sm mt-8">
          <h3 className="text-lg font-semibold mb-2">No Data Yet</h3>
          <p className="text-muted-foreground text-sm">
            You don't have any lead or message activity in this workspace yet. Start an intake
            workflow to populate your analytics.
          </p>
        </div>
      )}
    </div>
  );
}
