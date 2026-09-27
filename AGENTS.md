<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

- Multi-tenant data: every domain table carries `workspace_id`. Since we use MySQL (which lacks Postgres RLS), workspace isolation must be explicitly enforced in all Drizzle queries using `where(eq(..., workspaceId))`. Why: SaaS isolation without leaking data across tenants.
- integrations table stores non-secret metadata only; credentials stay in the managed secret store. Why: never persist secrets in DB.
