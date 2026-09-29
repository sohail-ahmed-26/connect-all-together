import fs from 'fs';
import path from 'path';

const filePath = path.resolve('src/routes/lead-discovery.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Remove auto-save from discoverLeadsFn
content = content.replace(
  /\/\/ ── Persist leads to Hostinger MySQL ──────────────────────────────────────[\s\S]*?return \{ leads: mappedLeads \};/,
  'return { leads: mappedLeads };'
);

// 2. Insert saveLeadsFn and getSavedLeadsFn
const serverFunctions = `

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
      sql\`INSERT IGNORE INTO workspaces (id, name, slug, created_by, created_at, updated_at)
          VALUES (\${workspaceId}, 'Default Workspace', \${workspaceId}, \${workspaceId}, NOW(), NOW())\`
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
            eq(leadsTable.source, "Prospeo"),
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
        source: "Prospeo" as const,
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
        source: s.source || "Prospeo",
        discoveredAt: meta.discoveredAt || s.created_at.toISOString().split("T")[0],
        isSaved: true
      } as Lead & { isSaved: boolean };
    });
  });
`;

content = content.replace(
  /\/\/ ─── Types ─────────────────────────────────────────────────────────────────────/,
  serverFunctions + '\n// ─── Types ─────────────────────────────────────────────────────────────────────'
);

// 3. Update route loader to fetch savedLeads
content = content.replace(
  /const profile = await getProfileFn\(\{ data: \{ profileId: deps\.profileId \} \}\);\s*return \{ profile \};/,
  'const profile = await getProfileFn({ data: { profileId: deps.profileId } });\n    const savedLeads = await getSavedLeadsFn({ data: { profileId: deps.profileId } });\n    return { profile, savedLeads };'
);

// 4. Update LeadDiscoveryPage hooks and state
content = content.replace(
  /const { profile } = Route.useLoaderData\(\);/,
  'const { profile, savedLeads } = Route.useLoaderData();\n  const [isSaving, setIsSaving] = useState(false);\n  const [saveResult, setSaveResult] = useState<{inserted: number, skipped: number} | null>(null);'
);

content = content.replace(
  /const \[leads, setLeads\] = useState<Lead\[\]>\(\[\]\);/,
  'const [leads, setLeads] = useState<Lead[]>(savedLeads || []);'
);

// 5. Update Lead properties to include isSaved flag
content = content.replace(
  /discoveredAt: string;\n\};/,
  'discoveredAt: string;\n  isSaved?: boolean;\n};'
);

// 6. Update discover handler to reset saveResult and merge leads
content = content.replace(
  /setLeads\(response\.leads\);/,
  'setSaveResult(null);\n      // Merge with existing leads, avoiding duplicates by id\n      const existingIds = new Set(leads.map(l => l.id));\n      const newUniqueLeads = response.leads.filter(l => !existingIds.has(l.id));\n      setLeads([...leads, ...newUniqueLeads]);'
);

// 7. Add saveLeads function handler
const saveHandler = `
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
`;

content = content.replace(
  /const totalPages = Math.max\(1, Math.ceil\(filteredLeads.length \/ pageSize\)\);/,
  saveHandler + '\n  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));'
);

// 8. Add Save Leads button and result badge to the UI
const saveButtonUI = `
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
`;

content = content.replace(
  /<\/div>\s*<div className="relative w-full sm:w-56">/,
  saveButtonUI
);

// 9. Display Saved badge in LeadRow
content = content.replace(
  /<span className="font-medium text-foreground">\{lead\.name\}<\/span>/,
  '<span className="font-medium text-foreground">{lead.name}</span>\n          {lead.isSaved && <Badge variant="secondary" className="w-fit text-[10px] h-4 px-1">Saved</Badge>}'
);

fs.writeFileSync(filePath, content);
console.log('Route updated successfully');
