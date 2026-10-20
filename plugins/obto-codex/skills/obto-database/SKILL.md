---
name: obto-database
description: >
  This skill should be used when the user wants to read from or change their
  OBTO app's own Postgres database — "query my Postgres tables", "what columns
  does this table have", "add a column/table/index", "change the schema",
  "save a row with the new field", "why was my schema change refused", "is my
  change applied yet" — or mentions obto_pg_query, obto_pg_check,
  obto_pg_propose, obto_pg_status, schema drift, or Prisma migrations against
  an OBTO-managed database. Covers read-only queries, the reviewed
  schema-change flow (check, propose, OBTO approves and applies), the interim
  rules for tables Prisma still reads, how to cut a change into units, what
  the tool refuses today, and what never to do.
version: 0.1.0
---

# OBTO App Database (Postgres)

Some OBTO apps own a Postgres database. The platform holds the connection; you reach the database only through the `obto_pg_*` tools, and every call carries `appName` (the app that owns the database) and your `domain` (from `obto_whoami`). `config.unknown_app` means the app has no database registered on OBTO — ask the OBTO operator; do not look for another way in.

| Tool | Use it to | Who |
|---|---|---|
| `obto_pg_query` | read data and the catalog (one read-only statement) | you |
| `obto_pg_check` | lint a schema change against the live catalog; stores nothing | you |
| `obto_pg_propose` | lint + rehearse on the real database inside `BEGIN … ROLLBACK`, then store the change | you |
| `obto_pg_status` / `obto_pg_list` | follow one change / list changes, newest first | you |
| `obto_pg_retry` / `obto_pg_cancel` | re-lint and re-rehearse a blocked change / stop one that has not run | proposer |
| `obto_pg_drift` / `obto_pg_ledger` | compare the live schema with the ledger / read the change history | you |
| `obto_pg_approve` / `obto_pg_apply` | approve and run a change on production | **OBTO operator only** |

`auth.ops_required` from approve or apply is the expected answer for a client, not a bug: the change waits for OBTO.

If these tools are missing from your tool list, the connection predates the release that added them — see "After an OBTO update" in `obto-troubleshooting`.

## Never

- **Never ask for, read, or print the database URL, password, or connection string.** No tool returns one, and nothing in this workflow needs it. If the user offers one, decline and continue with the tools.
- **Never change the database from outside OBTO** — no `psql`, no script or GUI with the URL, no DDL run from app code to get around a refusal.
- **Never run `prisma db push`, `prisma migrate dev`, or any other `prisma migrate` command against production.** `db push` drops columns its schema does not list — with their data — including columns added through OBTO. `migrate dev` reports drift and offers to reset the database. Any schema change made outside the tool shows up in `obto_pg_drift` and **blocks every apply** until OBTO adopts the drift; a change to `_prisma_migrations` counts as drift too.

## Reading: `obto_pg_query`

- **One statement:** `SELECT`, `WITH … SELECT`, or `EXPLAIN [ANALYZE]` of one. Writes (also inside `WITH`), a second statement, `SET`, `COPY`, `SELECT … INTO`, `FOR UPDATE/SHARE`, `$1` parameters, and functions that write, wait, or run hidden SQL are refused with `query.refused`; `details.rule` says why.
- **Limits:** a read-only transaction, 5 s per statement, 8 s for the whole call (`query.timeout`). At most 200 rows and 200 columns; `truncated: true` means more rows exist — page by key (`WHERE id > <last> ORDER BY id LIMIT 200`) or aggregate instead. Values over 2000 characters arrive cut (`... [+N chars]`); numbers longer than 15 characters and timestamps arrive as text.
- **Redaction is by design:** values of columns named like password/pass/token/secret/hash/api_key/salt, and anything computed from them, come back `[redacted]`; error messages that could quote a value show only the sqlstate. Do not try to work around it.
- **One at a time:** run queries one after another, never in parallel. `query.busy` means the app's connection pool has no room to spare right now — wait a few seconds and try once more.
- It **cannot write**. For writing data, see "Saving data" below.

Two useful first reads:

```sql
SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = '<table>' ORDER BY ordinal_position;
```

## Changing the schema

1. **Read first.** The table's columns, its NOT NULL columns without a default, constraints, triggers, row count, and which code reads it. Call `obto_pg_drift`: if it is not `ok`, every apply is blocked — tell the user before writing anything.
2. **Write the change as units** (next section). Give it a `title`, a one-paragraph `reason`, and `class: "expand"` for additive changes (`contract` = drops/renames and `rewrite` = type changes need an approver other than the proposer).
3. **Iterate with `obto_pg_check`** until it has no `refuse` finding. It stores nothing and runs no rehearsal, so iterate here, not with propose. `sql` alone is checked as one tx unit and will report `unit.expect_required` — a real change needs `units` with `expect`.
4. **`obto_pg_propose` once.** Read `result.state`:
   - `rehearsed` — ready. Tell the user the `changeId` and that OBTO approves and applies it.
   - `refused` — a refuse finding; it can never be approved. Fix the SQL and propose a new change.
   - `rehearsal_failed` or `blocked_drift` — fix the cause, then `obto_pg_retry` the same change.
   - `waiting_rehearsal` — another rehearsal or apply holds the app, or the rehearsal cooldown is running; `obto_pg_retry` after `precheck.waiting.retryAfterMs`.
   - `service.still_running` (an error answer) — the call is still running on the server; follow it with `obto_pg_list` / `obto_pg_status` instead of proposing again.
5. **OBTO approves and applies.** The approval binds to the change's `sqlSha256` and to the schema at that moment: if either moves in between, apply refuses (`apply.refused`) and the change must be rehearsed and approved again.
6. **Follow it to the end** with `obto_pg_status` (state, per-unit `run`, `ledgerSeq`). Done means: state `applied`, a `ledgerSeq`, each unit's `expect` true when you run it through `obto_pg_query`, and `obto_pg_drift` ok. `partial` or `failed` carries `run.error` — report it; OBTO decides the next step. Never tell the user a change is live before `obto_pg_status` says `applied`.

A rehearsal really runs on production (rolled back, but holding the same locks while it runs), and each app allows one rehearsal at a time with a cooldown after it, so never loop `propose` / `retry`. `obto_pg_noop_change` builds a change that changes nothing — useful to prove the pipeline end to end.

## Units: what commits together

- `tx` — one transaction; may hold several statements.
- `nontx` — exactly one statement that cannot run in a transaction: `CREATE/DROP INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`. It cannot be rehearsed (it is listed in `rehearsal.noRehearsal`, and the approver must note that).
- `backfill` — you give `{table, key, set, where, batchSize, pauseMs, maxBatches}`; the tool writes a batched, resumable `UPDATE`. It only updates.
- Every `tx` and `nontx` unit needs `expect`: one read-only `SELECT` returning one boolean, true once the unit is applied — it is how a stopped change resumes. `expect` and a backfill's `set` / `where` may call only built-in read functions.

**The rehearsal runs all units in one transaction that is rolled back, but apply commits each unit separately.** If unit 2 fails, unit 1 stays applied. So whatever must exist together goes in **one** tx unit — a new column, its comment, and the row that uses it. Split into several units only where a stop in between leaves the database in a state the app can live with. Two more splits are forced by lint: a `CONCURRENTLY` index always gets its own nontx unit, and one tx unit may take write-blocking locks on only one existing table (`tx.one_hot_table`).

## Interim rules: tables Prisma still reads

While app code still reads a table through Prisma, only **additive** changes are allowed on it:

- a new table;
- a new column that is nullable or has a constant default — `ADD COLUMN … NOT NULL` without a default is refused (`interim.not_null_no_default`, it breaks every Prisma create);
- a non-unique `CREATE INDEX CONCURRENTLY`, in its own nontx unit (a plain `CREATE INDEX` on an existing table is refused with `index.concurrently_required`).

Refused on those tables (`interim.prisma_table`): constraints, triggers, default changes, NOT NULL changes, type changes, renames, drops. A value added to an enum Prisma reads needs `prismaRefreshImage` (`interim.enum_needs_prisma_refresh`) — leave that one to OBTO. A new foreign key pointing at a Prisma table is allowed with a warning (`interim.fk_to_prisma_table`): Prisma deletes of a referenced row will then fail.

A column added through OBTO is unknown to the app's Prisma schema. The running Prisma client ignores it, so nothing breaks, but the app cannot read or write it through Prisma. Tell the user to add the field to the Prisma model (optional, e.g. `String?`) the next time the code changes — and that the database side is already done, so no migration is run for it.

## Saving data

`obto_pg_query` is read-only. Rows normally reach the database through the app's own code or API. When a change needs data of its own (for example a first row that uses a new column), put the `INSERT … VALUES` in the **same tx unit** as the DDL; it passes with the warning `dml.insert_existing` and goes through rehearsal, approval, and the ledger like the DDL. Filling existing rows is a `backfill` unit.

## What the tool refuses today

Read `rule` in each finding; the ones clients hit most:

- **`DROP COLUMN`** (any drop or rename) — `drop.requires_contract`. A drop needs class `contract`, a second approver, and the full SQL parser, which this server does not have yet; on Prisma tables the interim rule blocks it as well. Today the answer is: keep the column, or ask OBTO.
- **`DELETE`** — `dml.unbatched`. The message says "use a backfill unit", but a backfill can only `UPDATE`, so there is no tool path to delete rows today. Delete through the app's own API, or ask OBTO.
- Bulk `UPDATE` or `INSERT … SELECT` on an existing table — `dml.unbatched`; use a backfill unit.
- Anything the lint cannot classify — `recognizer.needs_parser`; it never runs. Rewrite it as simpler statements or ask OBTO.
- `DO`, `COPY`, `TRUNCATE`, `CASCADE`, roles, grants, `SET`, `BEGIN`/`COMMIT`, dynamic SQL in functions — always refused.

## Worked example: a new column plus one row that uses it

```json
{
  "appName": "<app>", "domain": "<your domain>", "class": "expand",
  "title": "Add gift_note to orders",
  "reason": "Customers can leave a gift note; one sample row proves the column end to end.",
  "units": [{
    "id": "gift-note-column-and-row", "kind": "tx",
    "sql": "ALTER TABLE public.orders ADD COLUMN gift_note text;\nCOMMENT ON COLUMN public.orders.gift_note IS 'Gift note from the customer.';\nINSERT INTO public.orders (id, status, updated_at, gift_note) VALUES ('<uuid>', 'TEST', CURRENT_TIMESTAMP, 'hello');",
    "expect": { "sql": "SELECT EXISTS (SELECT 1 FROM public.orders WHERE id = '<uuid>' AND gift_note = 'hello')" }
  }]
}
```

Before proposing, check that the `INSERT` supplies every NOT NULL column without a default. Run it through `obto_pg_check`, then `obto_pg_propose`, and report the `changeId` and state to the user.
