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

- Quality inspection, analysis and review reuse the recursive indicator calculation engine and paginated RLS-scoped reads to avoid divergent results.
- Measurement evidence uses a private bucket and measurement-linked access policies; inspection surfaces never expose mutation controls.
- Statistical calculations use simple-statistics and I-MR adjacent-month ranges; missing months break both ranges and failure streaks.
- CAPA escalation is revalidated by an invoker SQL function; monthly deadline reminders run once daily in PostgreSQL with duplicate suppression.
