import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Loader2, ArrowRight } from "lucide-react";
import { createServerFn } from "@tanstack/react-start";
import { db } from "../db";
import { targetProfiles } from "../../drizzle/schema";

const formSchema = z.object({
  industry: z.string().min(2, "Industry must be at least 2 characters"),
  companySize: z.enum(["1–10", "11–50", "51–200", "201+"], {
    required_error: "Please select a company size",
  }),
  jobTitles: z.string().min(2, "Job titles are required"),
});

const submitIntakeFn = createServerFn({ method: "POST" })
  .validator((data: z.infer<typeof formSchema>) => data)
  .handler(async ({ data }) => {
    const parsed = formSchema.parse(data);
    const runId = crypto.randomUUID();

    // Map company size to min/max
    let min = null;
    let max = null;
    if (parsed.companySize === "1–10") {
      min = 1;
      max = 10;
    } else if (parsed.companySize === "11–50") {
      min = 11;
      max = 50;
    } else if (parsed.companySize === "51–200") {
      min = 51;
      max = 200;
    } else if (parsed.companySize === "201+") {
      min = 201;
      max = null;
    }

    const { getRequest } = await import("@tanstack/react-start/server");
    const { auth } = await import("../lib/auth");

    const request = getRequest();
    let session = null;
    if (request) {
      session = await auth.api.getSession({ headers: request.headers });
    }

    if (!session?.user) {
      throw new Error(
        "Unauthorized: Workspace authentication is not yet available. Please log in.",
      );
    }

    // Default to the user's ID for workspace_id temporarily until workspace selection is built
    const workspaceId = session.user.id;

    await db.insert(targetProfiles).values({
      id: runId,
      workspace_id: workspaceId,
      name: `${parsed.industry} (${parsed.companySize})`,
      industry: parsed.industry,
      employee_min: min,
      employee_max: max,
      keywords: parsed.jobTitles,
    });

    console.log("Saved target profile to MySQL:", { runId, ...parsed });
    return { status: "success", runId };
  });

const getIntakeFn = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const { auth } = await import("../lib/auth");

  const request = getRequest();
  let session = null;
  if (request) {
    session = await auth.api.getSession({ headers: request.headers });
  }

  if (!session?.user) {
    return null;
  }

  const workspaceId = session.user.id;
  const { eq, desc } = await import("drizzle-orm");
  const result = await db.query.targetProfiles.findFirst({
    where: eq(targetProfiles.workspace_id, workspaceId),
    orderBy: desc(targetProfiles.created_at),
    columns: {
      id: true,
      industry: true,
      employee_min: true,
      keywords: true,
    }
  });
  return result || null;
});

export const Route = createFileRoute("/intake")({
  component: IntakePage,
  loader: async () => await getIntakeFn(),
});

type FormValues = z.infer<typeof formSchema>;

function IntakePage() {
  const existingProfile = Route.useLoaderData();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successData, setSuccessData] = useState<{ status: string; runId: string } | null>(
    existingProfile ? { status: "success", runId: existingProfile.id } : null,
  );
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: existingProfile
      ? {
          industry: existingProfile.industry,
          companySize: (existingProfile.employee_min === 1
            ? "1–10"
            : existingProfile.employee_min === 11
              ? "11–50"
              : existingProfile.employee_min === 51
                ? "51–200"
                : existingProfile.employee_min === 201
                  ? "201+"
                  : "1–10") as "1–10" | "11–50" | "51–200" | "201+",
          jobTitles: existingProfile.keywords || "",
        }
      : {
          industry: "",
          jobTitles: "",
        },
  });

  const companySize = watch("companySize");

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    setServerError(null);

    try {
      const result = await submitIntakeFn({ data });

      setSuccessData(result);
    } catch (err) {
      const error = err as Error;
      setServerError(error.message || "An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (successData) {
    return (
      <div className="mx-auto mt-12 max-w-md p-6">
        <div className="rounded-xl border bg-card p-8 text-center shadow-sm">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <CheckCircle2 className="h-6 w-6 text-primary" />
          </div>
          <h2 className="mb-2 text-2xl font-bold tracking-tight text-foreground">
            Targeting Submitted
          </h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Your intake has been successfully received and passed to the workflow engine.
          </p>
          <div className="mb-6 rounded-md bg-muted p-3 text-xs text-muted-foreground font-mono">
            Run ID: {successData.runId}
          </div>
          <Button onClick={() => setSuccessData(null)} variant="outline" className="w-full">
            Submit Another
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-12 max-w-lg p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Target Intake</h1>
        <p className="mt-2 text-muted-foreground">
          Define your target audience to start the outreach workflow.
        </p>
      </div>

      <div className="rounded-xl border bg-card p-6 shadow-sm">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="industry">Industry</Label>
            <Input
              id="industry"
              placeholder="e.g. Technology & Software"
              {...register("industry")}
            />
            {errors.industry && (
              <p className="text-sm font-medium text-destructive">{errors.industry.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="companySize">Company Size</Label>
            <Controller
              control={control}
              name="companySize"
              render={({ field }) => (
                <Select onValueChange={field.onChange} value={field.value}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select company size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1–10">1–10 employees</SelectItem>
                    <SelectItem value="11–50">11–50 employees</SelectItem>
                    <SelectItem value="51–200">51–200 employees</SelectItem>
                    <SelectItem value="201+">201+ employees</SelectItem>
                  </SelectContent>
                </Select>
              )}
            />
            {errors.companySize && (
              <p className="text-sm font-medium text-destructive">{errors.companySize.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="jobTitles">Job Titles</Label>
            <Textarea
              id="jobTitles"
              placeholder="e.g. CTO, VP of Engineering (comma separated)"
              {...register("jobTitles")}
            />
            {errors.jobTitles && (
              <p className="text-sm font-medium text-destructive">{errors.jobTitles.message}</p>
            )}
          </div>

          {serverError && (
            <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
              {serverError}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Start Target Workflow
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
