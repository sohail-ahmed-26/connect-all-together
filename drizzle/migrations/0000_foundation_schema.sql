-- Enums
CREATE TYPE public.workspace_role AS ENUM ('owner','admin','member');

-- Shared updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Workspaces
CREATE TABLE public.workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Users (app profile; id = auth user id)
CREATE TABLE public.users (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  full_name text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_idx ON public.users (lower(email));

-- Membership (roles kept separate from users)
CREATE TABLE public.workspace_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  role public.workspace_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON public.workspace_members(user_id);

-- Security definer helpers
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id=_workspace_id AND user_id=_user_id)
$$;
CREATE OR REPLACE FUNCTION public.has_workspace_role(_workspace_id uuid, _user_id uuid, _roles public.workspace_role[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id=_workspace_id AND user_id=_user_id AND role = ANY(_roles))
$$;

-- Auto-create user profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.users (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Auto-add creator as owner
CREATE OR REPLACE FUNCTION public.handle_new_workspace()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (NEW.id, NEW.created_by, 'owner');
  RETURN NEW;
END; $$;
CREATE TRIGGER on_workspace_created AFTER INSERT ON public.workspaces
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_workspace();

-- Domain tables
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  domain text, website text, industry text, phone text, email text,
  address text, city text, country text,
  google_place_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX companies_ws_idx ON public.companies(workspace_id);
CREATE INDEX companies_domain_idx ON public.companies(workspace_id, domain);
CREATE INDEX companies_email_idx ON public.companies(workspace_id, lower(email));
CREATE UNIQUE INDEX companies_place_uidx ON public.companies(workspace_id, google_place_id) WHERE google_place_id IS NOT NULL;

CREATE TABLE public.contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  first_name text, last_name text, title text,
  email text, phone text, whatsapp text, linkedin_url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contacts_ws_idx ON public.contacts(workspace_id);
CREATE INDEX contacts_company_idx ON public.contacts(company_id);
CREATE INDEX contacts_email_idx ON public.contacts(workspace_id, lower(email));
CREATE INDEX contacts_phone_idx ON public.contacts(workspace_id, phone);

CREATE TABLE public.campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  channel text,
  status text NOT NULL DEFAULT 'draft',
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  starts_at timestamptz, ends_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX campaigns_ws_status_idx ON public.campaigns(workspace_id, status);

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  owner_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'new',
  source text,
  score integer,
  notes text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_ws_status_idx ON public.leads(workspace_id, status);
CREATE INDEX leads_company_idx ON public.leads(company_id);
CREATE INDEX leads_contact_idx ON public.leads(contact_id);
CREATE INDEX leads_campaign_idx ON public.leads(campaign_id);

CREATE TABLE public.conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  channel text NOT NULL,
  external_thread_id text,
  status text NOT NULL DEFAULT 'open',
  last_message_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX conversations_ws_status_idx ON public.conversations(workspace_id, status);
CREATE INDEX conversations_lead_idx ON public.conversations(lead_id);
CREATE INDEX conversations_contact_idx ON public.conversations(contact_id);
CREATE INDEX conversations_ext_idx ON public.conversations(workspace_id, channel, external_thread_id);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  conversation_id uuid NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  direction text NOT NULL,
  channel text NOT NULL,
  body text,
  external_message_id text,
  status text NOT NULL DEFAULT 'pending',
  sent_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_ws_idx ON public.messages(workspace_id);
CREATE INDEX messages_conv_idx ON public.messages(conversation_id, created_at);
CREATE INDEX messages_status_idx ON public.messages(workspace_id, status);
CREATE INDEX messages_ext_idx ON public.messages(external_message_id);

CREATE TABLE public.followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE CASCADE,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES public.users(id) ON DELETE SET NULL,
  due_at timestamptz,
  status text NOT NULL DEFAULT 'pending',
  notes text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX followups_ws_status_idx ON public.followups(workspace_id, status, due_at);
CREATE INDEX followups_lead_idx ON public.followups(lead_id);

CREATE TABLE public.meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  organizer_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text, meeting_url text,
  status text NOT NULL DEFAULT 'scheduled',
  external_event_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX meetings_ws_status_idx ON public.meetings(workspace_id, status, starts_at);
CREATE INDEX meetings_lead_idx ON public.meetings(lead_id);

CREATE TABLE public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  type text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activities_ws_idx ON public.activities(workspace_id, created_at DESC);
CREATE INDEX activities_entity_idx ON public.activities(entity_type, entity_id);

-- Integrations: status/config only, NEVER secrets
CREATE TABLE public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider text NOT NULL,
  status text NOT NULL DEFAULT 'inactive',
  display_name text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider)
);
COMMENT ON TABLE public.integrations IS 'Non-secret integration metadata only. Credentials live in the managed secret store.';
CREATE INDEX integrations_ws_status_idx ON public.integrations(workspace_id, status);

CREATE TABLE public.agent_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  task_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  priority integer NOT NULL DEFAULT 0,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  created_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX agent_tasks_ws_status_idx ON public.agent_tasks(workspace_id, status, scheduled_at);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  actor_id uuid,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_ws_idx ON public.audit_logs(workspace_id, created_at DESC);
CREATE INDEX audit_logs_entity_idx ON public.audit_logs(entity_type, entity_id);

-- updated_at triggers
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['workspaces','users','companies','contacts','campaigns','leads','conversations','messages','followups','meetings','integrations','agent_tasks'] LOOP
    EXECUTE format('CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()', t);
  END LOOP;
END $$;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workspaces, public.workspace_members, public.companies, public.contacts, public.campaigns, public.leads, public.conversations, public.messages, public.followups, public.meetings, public.activities, public.integrations, public.agent_tasks TO authenticated;
GRANT SELECT, UPDATE ON public.users TO authenticated;
GRANT SELECT ON public.audit_logs TO authenticated;
GRANT ALL ON public.workspaces, public.users, public.workspace_members, public.companies, public.contacts, public.campaigns, public.leads, public.conversations, public.messages, public.followups, public.meetings, public.activities, public.integrations, public.agent_tasks, public.audit_logs TO service_role;

-- RLS
ALTER TABLE public.workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read workspace" ON public.workspaces FOR SELECT TO authenticated USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "users create workspace" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (created_by = auth.uid());
CREATE POLICY "admins update workspace" ON public.workspaces FOR UPDATE TO authenticated USING (public.has_workspace_role(id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY "owners delete workspace" ON public.workspaces FOR DELETE TO authenticated USING (public.has_workspace_role(id, auth.uid(), ARRAY['owner']::public.workspace_role[]));

CREATE POLICY "read own profile or teammates" ON public.users FOR SELECT TO authenticated USING (
  id = auth.uid() OR EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.user_id = users.id AND public.is_workspace_member(m.workspace_id, auth.uid())));
CREATE POLICY "update own profile" ON public.users FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());

CREATE POLICY "members read membership" ON public.workspace_members FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "admins add members" ON public.workspace_members FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY "admins update members" ON public.workspace_members FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY "admins remove members" ON public.workspace_members FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

CREATE POLICY "members read audit logs" ON public.audit_logs FOR SELECT TO authenticated USING (workspace_id IS NOT NULL AND public.is_workspace_member(workspace_id, auth.uid()));

-- Workspace-scoped tables: members full CRUD within their workspace
DO $$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['companies','contacts','campaigns','leads','conversations','messages','followups','meetings','activities','agent_tasks'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY "members select" ON public.%I FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()))', t);
    EXECUTE format('CREATE POLICY "members insert" ON public.%I FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()))', t);
    EXECUTE format('CREATE POLICY "members update" ON public.%I FOR UPDATE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid())) WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()))', t);
    EXECUTE format('CREATE POLICY "members delete" ON public.%I FOR DELETE TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()))', t);
  END LOOP;
END $$;

-- Integrations: members read, admins manage
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "members read integrations" ON public.integrations FOR SELECT TO authenticated USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "admins insert integrations" ON public.integrations FOR INSERT TO authenticated WITH CHECK (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY "admins update integrations" ON public.integrations FOR UPDATE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));
CREATE POLICY "admins delete integrations" ON public.integrations FOR DELETE TO authenticated USING (public.has_workspace_role(workspace_id, auth.uid(), ARRAY['owner','admin']::public.workspace_role[]));

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_workspace() FROM PUBLIC, anon, authenticated;