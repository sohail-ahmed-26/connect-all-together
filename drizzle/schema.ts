import { mysqlTable, varchar, timestamp, text, mysqlEnum, json, int, boolean } from "drizzle-orm/mysql-core";

export const workspaces = mysqlTable("workspaces", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }),
  created_by: varchar("created_by", { length: 36 }).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const user = mysqlTable("user", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: text("name").notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const session = mysqlTable("session", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id),
  token: varchar("token", { length: 255 }).notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const account = mysqlTable("account", {
  id: varchar("id", { length: 36 }).primaryKey(),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const verification = mysqlTable("verification", {
  id: varchar("id", { length: 36 }).primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const workspaceMembers = mysqlTable("workspace_members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspace_id: varchar("workspace_id", { length: 36 })
    .notNull()
    .references(() => workspaces.id),
  user_id: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => user.id),
  role: mysqlEnum("role", ["owner", "admin", "member"]).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
});

export const leads = mysqlTable("leads", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspace_id: varchar("workspace_id", { length: 36 })
    .notNull()
    .references(() => workspaces.id),
  campaign_id: varchar("campaign_id", { length: 36 }),
  company_id: varchar("company_id", { length: 36 }),
  contact_id: varchar("contact_id", { length: 36 }),
  owner_id: varchar("owner_id", { length: 36 }).references(() => user.id),
  status: varchar("status", { length: 50 }).notNull().default("new"),
  source: varchar("source", { length: 255 }),
  score: varchar("score", { length: 50 }),
  notes: text("notes"),
  metadata: json("metadata"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

/**
 * target_profiles — Issue #1 Target Intake Agent
 * Each row represents one set of targeting criteria submitted by a user.
 * workspace_id enforces multi-tenant isolation (no RLS → always filter by it).
 */
export const targetProfiles = mysqlTable("target_profiles", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspace_id: varchar("workspace_id", { length: 36 }).notNull(),
  // Core targeting fields
  name: varchar("name", { length: 255 }).notNull(),
  industry: varchar("industry", { length: 255 }).notNull(),
  target_location: varchar("target_location", { length: 255 }),
  employee_min: int("employee_min"),
  employee_max: int("employee_max"),
  budget_range: varchar("budget_range", { length: 100 }),
  keywords: text("keywords"), // comma-separated topic/role keywords
  additional_filters: json("additional_filters"), // arbitrary extra criteria
  status: varchar("status", { length: 50 }).notNull().default("active"),
  submitted_at: timestamp("submitted_at").defaultNow().notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type TargetProfile = typeof targetProfiles.$inferSelect;
export type NewTargetProfile = typeof targetProfiles.$inferInsert;

export const contacts = mysqlTable("contacts", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspace_id: varchar("workspace_id", { length: 36 })
    .notNull()
    .references(() => workspaces.id),
  lead_id: varchar("lead_id", { length: 36 }).references(() => leads.id),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }),
  linkedin_url: varchar("linkedin_url", { length: 255 }),
  status: varchar("status", { length: 50 }).notNull().default("new"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const conversations = mysqlTable("conversations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspace_id: varchar("workspace_id", { length: 36 })
    .notNull()
    .references(() => workspaces.id),
  contact_id: varchar("contact_id", { length: 36 })
    .notNull()
    .references(() => contacts.id),
  platform: varchar("platform", { length: 50 }).notNull(), // 'linkedin', 'email'
  status: varchar("status", { length: 50 }).default("open"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const messages = mysqlTable("messages", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspace_id: varchar("workspace_id", { length: 36 })
    .notNull()
    .references(() => workspaces.id),
  conversation_id: varchar("conversation_id", { length: 36 })
    .notNull()
    .references(() => conversations.id),
  sender_id: varchar("sender_id", { length: 36 }), // null if inbound, user.id if outbound
  direction: mysqlEnum("direction", ["inbound", "outbound"]).notNull(),
  content: text("content").notNull(),
  sent_at: timestamp("sent_at").defaultNow().notNull(),
});

export const agentTasks = mysqlTable("agent_tasks", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspace_id: varchar("workspace_id", { length: 36 })
    .notNull()
    .references(() => workspaces.id),
  agent_type: varchar("agent_type", { length: 50 }).notNull(), // 'outreach', 'follow_up'
  target_id: varchar("target_id", { length: 36 }),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed", "cancelled"])
    .default("pending")
    .notNull(),
  payload: json("payload"), // Task configuration data
  scheduled_for: timestamp("scheduled_for").notNull(),
  locked_at: timestamp("locked_at"),
  locked_by: varchar("locked_by", { length: 255 }),
  attempts: int("attempts").default(0).notNull(),
  error: text("error"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const integrations = mysqlTable("integrations", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspace_id: varchar("workspace_id", { length: 36 })
    .notNull()
    .references(() => workspaces.id),
  provider: varchar("provider", { length: 50 }).notNull(), // e.g. 'gmail', 'google_maps', 'n8n'
  status: varchar("status", { length: 50 }).notNull().default("active"),
  metadata: json("metadata"), // non-secret metadata only
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
