import { mysqlTable, varchar, timestamp, text, mysqlEnum, json } from "drizzle-orm/mysql-core";

export const workspaces = mysqlTable("workspaces", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 255 }),
  created_by: varchar("created_by", { length: 36 }).notNull(),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(), // Supabase auth user id
  email: varchar("email", { length: 255 }).notNull().unique(),
  full_name: varchar("full_name", { length: 255 }),
  avatar_url: text("avatar_url"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export const workspaceMembers = mysqlTable("workspace_members", {
  id: varchar("id", { length: 36 }).primaryKey(),
  workspace_id: varchar("workspace_id", { length: 36 })
    .notNull()
    .references(() => workspaces.id),
  user_id: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id),
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
  owner_id: varchar("owner_id", { length: 36 }).references(() => users.id),
  status: varchar("status", { length: 50 }).notNull().default("new"),
  source: varchar("source", { length: 255 }),
  score: varchar("score", { length: 50 }),
  notes: text("notes"),
  metadata: json("metadata"),
  created_at: timestamp("created_at").defaultNow().notNull(),
  updated_at: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});
