import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Search,
  Loader2,
  AlertTriangle,
  PlugZap,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Building2,
  Users,
  Tag,
  Filter,
} from "lucide-react";

// ─── Search param schema ───────────────────────────────────────────────────────
const searchSchema = z.object({
  profileId: z.string().optional(),
});

// ─── Server function: load target profile by ID ─────────────────────────────
const getProfileFn = createServerFn({ method: "GET" })
  .validator((data: { profileId: string }) => data)
  .handler(async ({ data }) => {
    const { db } = await import("../db");
    const { targetProfiles } = await import("../../drizzle/schema");
    const { eq } = await import("drizzle-orm");

    let profile = null;
    try {
      profile = await db.query.targetProfiles.findFirst({
        where: eq(targetProfiles.id, data.profileId),
        columns: {
          id: true,
          name: true,
          industry: true,
          employee_min: true,
          employee_max: true,
          keywords: true,
          target_location: true,
          status: true,
          created_at: true,
        },
      });
    } catch (dbError) {
      console.error("[getProfile] Database query failed:", dbError);
      throw new Error(`Database error in getProfile: ${(dbError as Error).message || String(dbError)}`);
    }

    return profile;
  });

// ─── Server function: Discover leads via Apify API ────────────────────────────
const discoverLeadsFn = createServerFn({ method: "POST" })
  .validator((data: { profileId: string; additionalInstructions?: string }) => data)
  .handler(async ({ data }) => {
    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db");
    const { targetProfiles } = await import("../../drizzle/schema");

    // Load the profile to get search criteria (no auth required – profileId is the key)
    let profile;
    try {
      profile = await db.query.targetProfiles.findFirst({
        where: eq(targetProfiles.id, data.profileId),
      });
    } catch (dbError: any) {
      console.error("====================== DB ERROR ======================");
      console.error("[discoverLeads] Database query failed:", dbError);
      console.error("Name:", dbError?.name);
      console.error("Message:", dbError?.message);
      console.error("Code:", dbError?.code);
      console.error("Errno:", dbError?.errno);
      console.error("SqlState:", dbError?.sqlState);
      console.error("Cause:", dbError?.cause);
      console.error("Stack:", dbError?.stack);
      console.error("======================================================");
      throw new Error(`Database error: ${dbError?.message || String(dbError)}`);
    }

    if (!profile) {
      throw new Error("Profile not found");
    }

    // Use the profile's own workspace_id for saving leads
    const workspaceId = profile.workspace_id;

    // Prepare Apify payload
    const API_KEY = process.env["APIFY_API_TOKEN"] || process.env["apify_api_key"];
    if (!API_KEY) {
      throw new Error("APIFY_API_TOKEN is not configured on the server.");
    }

    const keywords = profile.keywords
      ? profile.keywords
          .split(",")
          .map((k: string) => k.trim())
          .filter(Boolean)
      : [];

    const searchQueryParts = [];
    if (profile.industry) searchQueryParts.push(profile.industry);
    if (keywords.length > 0) searchQueryParts.push(...keywords);
    const location = profile.target_location || "";
    
    let searchString = searchQueryParts.join(" ");
    if (location) {
        searchString += ` in ${location}`;
    }
    if (!searchString) searchString = "businesses";

    const payload = {
        searchStringsArray: [searchString],
        maxCrawledPlacesPerSearch: 10,
        language: "en",
        maxImages: 0,
        maxReviews: 0,
        scrapeReviewerUrl: false,
        includeWebResults: true, // Enables deep scraping for website emails and contacts
    };

    const callApify = async () => {
      const ACTOR_ID = "compass~crawler-google-places";
      const res = await fetch(`https://api.apify.com/v2/acts/${ACTOR_ID}/run-sync-get-dataset-items?token=${API_KEY}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Apify API error (${res.status}): ${errText.substring(0, 100)}`);
      }
      return await res.json();
    };

    let results: any[] = [];
    try {
      results = await callApify();
    } catch (e: any) {
       console.error("[discoverLeads] Apify execution failed:", e);
       throw new Error(e.message || "Apify API error");
    }

    if (!Array.isArray(results) || results.length === 0) {
        return { leads: [] };
    }

    console.log(`[discoverLeads] Apify returned ${results.length} results`);

    const mappedLeads = results.map((item: any) => {
      const companyName = item.title || "Unknown Company";
      const companyWebsite = item.website || "";
      const leadLocation = item.address || item.city || "Unknown Location";
      const phone = item.phone || item.phoneUnformatted || "";
      
      // Try to extract email from various possible Apify Google Places output fields
      let email = "";
      if (item.email) email = item.email;
      else if (item.emails && Array.isArray(item.emails) && item.emails.length > 0) email = item.emails[0];
      else if (item.webResults && item.webResults.emails && item.webResults.emails.length > 0) email = item.webResults.emails[0];
      
      // Contact name might be in webResults or similar
      let name = item.contactName || "";
      if (!name && item.webResults && item.webResults.contacts && item.webResults.contacts.length > 0) {
        name = item.webResults.contacts[0].name || "";
      }
      
      return {
        id: item.placeId || crypto.randomUUID(),
        company: companyName,
        website: companyWebsite.startsWith("http")
          ? companyWebsite
          : companyWebsite
            ? `https://${companyWebsite}`
            : "",
        industry: item.categoryName || profile.industry || "",
        location: leadLocation,
        email: email,
        phone: phone,
        name: name, 
        jobTitle: "",
        linkedinUrl: "",
        source: "Apify",
        discoveredAt: new Date().toISOString().split("T")[0] ?? "",
      };
    });


    return { leads: mappedLeads };
  });



// ─── Server function: Save discovered leads to DB ──────────────────────────────
export const saveLeadsFn = createServerFn({ method: "POST" })
  .validator((data: { profileId: string; leads: Lead[] }) => data)
  .handler(async ({ data }) => {
    const { eq, and, inArray } = await import("drizzle-orm");
    const { db } = await import("../db");
    const { targetProfiles, leads: leadsTable, workspaces } = await import("../../drizzle/schema");

    // Get workspace from profile
    const profile = await db.query.targetProfiles.findFirst({
      where: eq(targetProfiles.id, data.profileId),
    });
    if (!profile) throw new Error("Profile not found");
    const workspaceId = profile.workspace_id;

    // Ensure workspace exists
    const { sql } = await import("drizzle-orm");
    await db.execute(
      sql`INSERT IGNORE INTO workspaces (id, name, slug, created_by, created_at, updated_at)
          VALUES (${workspaceId}, 'Default Workspace', ${workspaceId}, ${workspaceId}, NOW(), NOW())`
    );

    const providerIds = data.leads.map(l => l.id).filter(Boolean);
    
    // Find existing leads to prevent duplicates
    let existingProviderIds = new Set<string>();
    if (providerIds.length > 0) {
      const existingLeads = await db.select({ provider_id: leadsTable.provider_id })
        .from(leadsTable)
        .where(
          and(
            eq(leadsTable.workspace_id, workspaceId),
            eq(leadsTable.source, "Apify"),
            inArray(leadsTable.provider_id, providerIds)
          )
        );
      existingProviderIds = new Set(existingLeads.map(l => l.provider_id!).filter(Boolean));
    }

    const newLeads = data.leads.filter(l => !existingProviderIds.has(l.id));

    if (newLeads.length > 0) {
      const rows = newLeads.map((lead) => ({
        id: crypto.randomUUID(),
        workspace_id: workspaceId,
        target_profile_id: data.profileId,
        provider_id: lead.id,
        status: "new" as const,
        source: "Apify" as const,
        metadata: lead,
      }));

      // Insert in chunks of 50
      const CHUNK = 50;
      for (let i = 0; i < rows.length; i += CHUNK) {
        await db.insert(leadsTable).values(rows.slice(i, i + CHUNK));
      }
    }

    return { 
      inserted: newLeads.length, 
      skipped: data.leads.length - newLeads.length,
      total: data.leads.length
    };
  });

// ─── Server function: Get saved leads ──────────────────────────────────────────
export const getSavedLeadsFn = createServerFn({ method: "GET" })
  .validator((data: { profileId: string }) => data)
  .handler(async ({ data }) => {
    const { eq } = await import("drizzle-orm");
    const { db } = await import("../db");
    const { leads: leadsTable } = await import("../../drizzle/schema");

    const saved = await db.select().from(leadsTable).where(eq(leadsTable.target_profile_id, data.profileId));
    
    return saved.map(s => {
      // Safely parse metadata back into Lead format
      const meta = (s.metadata || {}) as Partial<Lead>;
      return {
        id: s.provider_id || s.id,
        name: meta.name || "Unknown",
        jobTitle: meta.jobTitle || "",
        company: meta.company || "Unknown",
        website: meta.website || "",
        industry: meta.industry || "",
        location: meta.location || "",
        email: meta.email || "Hidden",
        phone: meta.phone || "Hidden",
        linkedinUrl: meta.linkedinUrl || "",
        source: s.source || "Apify",
        discoveredAt: meta.discoveredAt || s.created_at.toISOString().split("T")[0],
        isSaved: true
      } as Lead & { isSaved: boolean };
    });
  });

// ─── Types ─────────────────────────────────────────────────────────────────────
type TargetProfile = {
  id: string;
  name: string;
  industry: string;
  employee_min: number | null;
  employee_max: number | null;
  keywords: string | null;
  target_location: string | null;
  status: string;
  created_at: Date;
};

type Lead = {
  id: string;
  name: string;
  jobTitle: string;
  company: string;
  website: string;
  industry: string;
  location: string;
  email: string;
  phone: string;
  linkedinUrl: string;
  source: string;
  discoveredAt: string;
  isSaved?: boolean;
};

// ─── Route definition ──────────────────────────────────────────────────────────
export const Route = createFileRoute("/lead-discovery")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ profileId: search.profileId }),
  loader: async ({ deps }) => {
    if (!deps.profileId) return { profile: null };
    const profile = await getProfileFn({ data: { profileId: deps.profileId } });
    const savedLeads = await getSavedLeadsFn({ data: { profileId: deps.profileId } });
    return { profile, savedLeads };
  },
  component: LeadDiscoveryPage,
});

// ─── Helper: company size label ────────────────────────────────────────────────
function companySizeLabel(min: number | null, max: number | null): string {
  if (min === null) return "Any size";
  if (max === null) return `${min}+ employees`;
  return `${min}–${max} employees`;
}

// ─── Empty state ───────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Search className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold text-foreground">No leads yet</h3>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        Connect a search provider and run a discovery to populate this table.
      </p>
    </div>
  );
}

// ─── Apify connected banner ─────────────────────────────────────────────────
function ProviderDisconnectedBanner() {
  return (
    <div
      id="provider-connected-banner"
      className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30"
    >
      <PlugZap className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400" />
      <div>
        <p className="text-sm font-medium text-emerald-800 dark:text-emerald-200">Apify connected</p>
        <p className="mt-0.5 text-xs text-emerald-700 dark:text-emerald-300">
          Lead search is powered by Apify. Click &ldquo;Discover Leads&rdquo; to find companies
          and contacts matching your target profile.
        </p>
      </div>
    </div>
  );
}

// ─── Lead row ─────────────────────────────────────────────────────────────────
function LeadRow({ lead, onView }: { lead: Lead; onView: (lead: Lead) => void }) {
  return (
    <tr className="border-b border-border transition-colors hover:bg-muted/40">
      <td className="px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-medium text-foreground">{lead.name}</span>
          {lead.isSaved && <Badge variant="secondary" className="w-fit text-[10px] h-4 px-1">Saved</Badge>}
          <span className="text-xs text-muted-foreground">{lead.jobTitle}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-primary/10">
            <Building2 className="h-3.5 w-3.5 text-primary" />
          </div>
          <span className="text-sm text-foreground">{lead.company}</span>
        </div>
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">
        {lead.website ? (
          <a
            href={lead.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 hover:text-primary"
          >
            {lead.website.replace(/^https?:\/\//, "")}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          "—"
        )}
      </td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{lead.industry || "—"}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{lead.location || "—"}</td>
      <td className="px-4 py-3 text-sm text-muted-foreground">{lead.email || "—"}</td>
      <td className="px-4 py-3">
        <Badge variant="secondary" className="text-xs">
          {lead.source}
        </Badge>
      </td>
      <td className="px-4 py-3 text-xs text-muted-foreground">{lead.discoveredAt}</td>
      <td className="px-4 py-3">
        <Button size="sm" variant="outline" onClick={() => onView(lead)}>
          View
        </Button>
      </td>
    </tr>
  );
}

// ─── Lead detail drawer (simple inline panel) ─────────────────────────────────
function LeadDetailPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <h3 className="font-semibold text-foreground">Lead Details</h3>
        <button
          onClick={onClose}
          className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          ✕
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Name</p>
          <p className="mt-1 text-sm font-medium text-foreground">{lead.name}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Job Title</p>
          <p className="mt-1 text-sm text-foreground">{lead.jobTitle || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Company
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{lead.company}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Website
          </p>
          <p className="mt-1 text-sm text-foreground">{lead.website || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Industry
          </p>
          <p className="mt-1 text-sm text-foreground">{lead.industry || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Location
          </p>
          <p className="mt-1 text-sm text-foreground">{lead.location || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Email</p>
          <p className="mt-1 text-sm text-foreground">{lead.email || "—"}</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Phone</p>
          <p className="mt-1 text-sm text-foreground">{lead.phone || "—"}</p>
        </div>
        {lead.linkedinUrl && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">LinkedIn</p>
            <a
              href={lead.linkedinUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              View profile <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        )}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Source
          </p>
          <Badge variant="secondary" className="mt-1">
            {lead.source}
          </Badge>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Discovered
          </p>
          <p className="mt-1 text-sm text-foreground">{lead.discoveredAt}</p>
        </div>
      </div>
      <div className="border-t border-border p-6">
        <Button variant="outline" className="w-full" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────
function LeadDiscoveryPage() {
  const { profile, savedLeads } = Route.useLoaderData();
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{inserted: number, skipped: number} | null>(null);
  const search = Route.useSearch();

  const [isDiscovering, setIsDiscovering] = useState(false);
  const [leads, setLeads] = useState<Lead[]>(savedLeads || []);
  const [hasAttempted, setHasAttempted] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 10;
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [additionalInstructions, setAdditionalInstructions] = useState("");

  // Filter leads by search text
  const filteredLeads = leads.filter((l) => {
    const q = filterText.toLowerCase();
    return (
      l.company.toLowerCase().includes(q) ||
      l.industry.toLowerCase().includes(q) ||
      l.location.toLowerCase().includes(q)
    );
  });

  
  const handleSaveLeads = async () => {
    if (!profile || leads.length === 0) return;
    setIsSaving(true);
    setErrorBanner(null);
    setSaveResult(null);

    try {
      const response = await saveLeadsFn({
        data: {
          profileId: profile.id,
          leads: leads.filter(l => !l.isSaved), // only save unsaved ones
        }
      });
      setSaveResult({ inserted: response.inserted, skipped: response.skipped });
      
      // Mark as saved in local state
      setLeads(leads.map(l => ({ ...l, isSaved: true })));
    } catch (err) {
      console.error(err);
      setErrorBanner((err as Error).message || "Failed to save leads");
    } finally {
      setIsSaving(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const pagedLeads = filteredLeads.slice((page - 1) * pageSize, page * pageSize);

  const handleDiscover = async () => {
    if (!profile) return;
    setIsDiscovering(true);
    setHasAttempted(true);
    setErrorBanner(null);

    try {
      const response = await discoverLeadsFn({
        data: {
          profileId: profile.id,
          additionalInstructions,
        },
      });
      setSaveResult(null);
      // Merge with existing leads, avoiding duplicates by id
      const existingIds = new Set(leads.map(l => l.id));
      const newUniqueLeads = response.leads.filter(l => !existingIds.has(l.id));
      setLeads([...leads, ...newUniqueLeads]);
    } catch (err) {
      const error = err as Error;
      console.error(error);
      setErrorBanner(error.message || "Failed to discover leads");
      setLeads([]);
    } finally {
      setIsDiscovering(false);
    }
  };

  // ─── No profile selected ───────────────────────────────────────────────────
  if (!search.profileId || !profile) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-4 text-center">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <AlertTriangle className="h-6 w-6 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">No target profile selected</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Complete the Target Intake first to define your search criteria.
        </p>
        <Link
          to="/intake"
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Go to Target Intake
        </Link>
      </div>
    );
  }

  const keywords = profile.keywords
    ? profile.keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
    : [];

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
          <Link
            to="/intake"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Intake
          </Link>
          <span className="text-muted-foreground/40">|</span>
          <nav className="flex items-center gap-1 text-sm text-muted-foreground">
            <span>Target Intake</span>
            <ChevronRight className="h-4 w-4" />
            <span className="font-medium text-foreground">Lead Discovery</span>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Lead Discovery</h1>
          <p className="mt-1 text-muted-foreground">
            Find companies and contacts matching your target profile.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Left panel: profile summary + search config */}
          <div className="space-y-4 lg:col-span-1">
            {/* Profile summary card */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  Target Profile
                </p>
                <Link to="/intake" className="text-xs font-medium text-primary hover:underline">
                  Change profile
                </Link>
              </div>
              <h2 className="text-base font-semibold text-foreground">{profile.name}</h2>

              <dl className="mt-4 space-y-3">
                <div className="flex items-start gap-2">
                  <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Industry</dt>
                    <dd className="text-sm font-medium text-foreground">{profile.industry}</dd>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <div>
                    <dt className="text-xs text-muted-foreground">Company size</dt>
                    <dd className="text-sm font-medium text-foreground">
                      {companySizeLabel(profile.employee_min, profile.employee_max)}
                    </dd>
                  </div>
                </div>

                {keywords.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Tag className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="text-xs text-muted-foreground">Target job titles</dt>
                      <dd className="mt-1 flex flex-wrap gap-1">
                        {keywords.map((k) => (
                          <Badge key={k} variant="secondary" className="text-xs">
                            {k}
                          </Badge>
                        ))}
                      </dd>
                    </div>
                  </div>
                )}

                {profile.target_location && (
                  <div className="flex items-start gap-2">
                    <Filter className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <dt className="text-xs text-muted-foreground">Location</dt>
                      <dd className="text-sm font-medium text-foreground">
                        {profile.target_location}
                      </dd>
                    </div>
                  </div>
                )}
              </dl>

              <div className="mt-4 border-t border-border pt-3">
                <p className="text-xs text-muted-foreground">
                  Profile ID: <span className="font-mono">{profile.id.slice(0, 8)}…</span>
                </p>
              </div>
            </div>

            {/* Additional instructions */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <label
                htmlFor="additional-instructions"
                className="mb-2 block text-sm font-medium text-foreground"
              >
                Additional search instructions{" "}
                <span className="text-xs font-normal text-muted-foreground">(optional)</span>
              </label>
              <textarea
                id="additional-instructions"
                rows={4}
                className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                placeholder="e.g. Focus on Series A companies in Europe, exclude agencies…"
                value={additionalInstructions}
                onChange={(e) => setAdditionalInstructions(e.target.value)}
              />
            </div>

            {/* Provider notice / error banner */}
            {errorBanner ? (
              <div className="flex items-start gap-3 rounded-lg border border-destructive/20 bg-destructive/10 p-4">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
                <div>
                  <p className="text-sm font-medium text-destructive">Search Error</p>
                  <p className="mt-0.5 text-xs text-destructive/80">{errorBanner}</p>
                </div>
              </div>
            ) : (
              <ProviderDisconnectedBanner />
            )}

            {/* Discover button */}
            <Button
              id="discover-leads-btn"
              className="w-full"
              onClick={handleDiscover}
              disabled={isDiscovering}
            >
              {isDiscovering ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Searching…
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Discover Leads
                </>
              )}
            </Button>
          </div>

          {/* Right panel: results table */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-border bg-card shadow-sm">
              {/* Table header row */}
              <div className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="font-semibold text-foreground">Results</h3>
                  <p className="text-xs text-muted-foreground">
                    {filteredLeads.length} lead{filteredLeads.length !== 1 ? "s" : ""} found
                  </p>
                
                </div>
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  {saveResult && (
                    <Badge variant={saveResult.inserted > 0 ? "default" : "secondary"} className="whitespace-nowrap">
                      {saveResult.inserted} saved, {saveResult.skipped} duplicates
                    </Badge>
                  )}
                  <Button 
                    size="sm" 
                    onClick={handleSaveLeads} 
                    disabled={isSaving || leads.length === 0 || leads.every(l => l.isSaved)}
                    className="w-full sm:w-auto"
                  >
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Leads
                  </Button>
                  <div className="relative w-full sm:w-56">

                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="leads-filter-input"
                    placeholder="Filter results…"
                    className="pl-8 text-sm h-8"
                    value={filterText}
                    onChange={(e) => {
                      setFilterText(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>
            </div>

              {/* Table */}
              {leads.length === 0 ? (
                hasAttempted ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center px-6">
                    <Search className="mb-3 h-10 w-10 text-muted-foreground" />
                    <h3 className="text-base font-semibold text-foreground">
                      No leads found
                    </h3>
                    <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">
                      Apify returned 0 results for your current target profile. Try broadening
                      your industry or keywords and search again.
                    </p>
                  </div>
                ) : (
                  <EmptyState />
                )
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left text-sm">
                      <thead className="border-b border-border bg-muted/30 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        <tr>
                          <th className="px-4 py-3">Name / Title</th>
                          <th className="px-4 py-3">Company</th>
                          <th className="px-4 py-3">Website</th>
                          <th className="px-4 py-3">Industry</th>
                          <th className="px-4 py-3">Location</th>
                          <th className="px-4 py-3">Email</th>
                          <th className="px-4 py-3">Source</th>
                          <th className="px-4 py-3">Discovered</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedLeads.map((lead) => (
                          <LeadRow key={lead.id} lead={lead} onView={(l) => setSelectedLead(l)} />
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  <div className="flex items-center justify-between border-t border-border px-5 py-3">
                    <p className="text-xs text-muted-foreground">
                      Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={page === totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Lead detail slide-in panel */}
      {selectedLead && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
            onClick={() => setSelectedLead(null)}
          />
          <LeadDetailPanel lead={selectedLead} onClose={() => setSelectedLead(null)} />
        </>
      )}
    </div>
  );
}
