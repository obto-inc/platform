---
name: obto-database
description: >
  This skill should be used when the user wants to read from or change their
  OBTO app's own Postgres database — "query my Postgres tables", "what columns
  does this table have", "add a column/table/index", "change the schema",
  "save a row with the new field", "why was my schema change refused", "is my
  change applied yet" — or mentions obto_pg_query, obto_pg_check,
  obto_pg_propose, obto_pg_status, or schema drift. Covers read-only
  queries, the reviewed schema-change flow (check, prepare, then apply after
  the owner's yes in chat), who may change the database, how to cut a change
  into units, what the tool refuses today, and what never to do.
version: 0.3.0
---

# OBTO App Database (Postgres)

Some OBTO apps own a Postgres database. The platform holds the connection; you reach the database only through the `obto_pg_*` tools, and every call carries `appName` (the app that owns the database) and your `domain` (from `obto_whoami`). `config.unknown_app` means the app has no database registered on OBTO — file it with `sdlc_create_item` ("ask OBTO" below means the same); do not look for another way in.

| Tool | Use it to | Who |
|---|---|---|
| `obto_pg_query` | read data and the catalog (one read-only statement) | you |
| `obto_pg_check` | lint a schema change against the live catalog; stores nothing | you |
| `obto_pg_propose` | prepare: lint + rehearse on the real database inside `BEGIN … ROLLBACK`, then store the change | app owner, OBTO |
| `obto_pg_status` / `obto_pg_list` | follow one change / list changes, newest first | you |
| `obto_pg_retry` / `obto_pg_cancel` | re-lint and re-rehearse a blocked change / stop one that has not run | app owner, OBTO |
| `obto_pg_drift` / `obto_pg_ledger` | compare the live schema with the ledger / read the change history | you |
| `obto_pg_apply` | run a prepared change on production, after the owner's yes in chat | **app owner, OBTO** |

**Only the app's owner and OBTO can change the app's database.** The owner is a user whose home domain is the app's domain and who has the `super` role there; a user who reaches the domain through a cross-tenant switch never is. The owner's AI checks a change, prepares it (`obto_pg_propose`) and applies it (`obto_pg_apply`) after the owner says yes in chat. Anyone else reads and checks only: every write answers `auth.owner_only` ("Only the app's owner can change this database. Ask them."). `auth.owner_changes_off` means OBTO has paused owner changes: ask OBTO. A `baseline` is always OBTO. These are expected answers, not bugs.

If these tools are missing from your tool list, the connection predates the release that added them — see "After an OBTO update" in `obto-troubleshooting`.

## Never

- **Never ask for, read, or print the database URL, password, or connection string.** No tool returns one, and nothing in this workflow needs it. If the user offers one, decline and continue with the tools.
- **Never change the schema from outside OBTO**: no migration tool, ORM schema push, `psql`, script or GUI with the URL, and no DDL run from app code to get around a refusal. Any such change shows up in `obto_pg_drift` and **blocks every apply** until the drift is adopted (an `adopt_drift` change, made by the owner or OBTO).

## Reading: `obto_pg_query`

- **One statement:** `SELECT`, `WITH … SELECT`, or `EXPLAIN [ANALYZE]` of one. Writes (also inside `WITH`), a second statement, `SET`, `COPY`, `SELECT … INTO`, `FOR UPDATE/SHARE`, `$1` parameters, and functions that write, wait, or run hidden SQL are refused with `query.refused`; `details.rule` says why.
- **Limits:** a read-only transaction, 5 s per statement, 8 s for the whole call (`query.timeout`). At most 200 rows and 200 columns; `truncated: true` means more rows exist — page by key (`WHERE id > <last> ORDER BY id LIMIT 200`) or aggregate instead. Values over 2000 characters arrive cut (`... [+N chars]`); numbers longer than 15 characters and timestamps arrive as text.
- **Redaction is by design:** values of columns named like password/pass/token/secret/hash/api_key/salt, and anything computed from them, come back `[redacted]`; error messages that could quote a value show only the sqlstate. Do not try to work around it.
- **One at a time:** run queries one after another, never in parallel. `query.busy` means the app's connection pool has no room to spare right now — wait a few seconds and try once more.
- It **cannot write**. For writing data, see "Saving data" below.

Two useful first reads (one per call):

```sql
SELECT relname, n_live_tup FROM pg_stat_user_tables WHERE schemaname = 'public' ORDER BY relname;
SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = '<table>' ORDER BY ordinal_position;
```

## Changing the schema

1. **Read first.** The table's columns, its NOT NULL columns without a default, constraints, triggers, row count, and which code reads it. Call `obto_pg_drift`: if it is not `ok`, every apply is blocked — tell the user before writing anything.
2. **Write the change as units** (next section). Give it a `title`, a one-paragraph `reason`, and `class: "expand"` for additive changes (`contract` = drops/renames, `rewrite` = type changes).
3. **Iterate with `obto_pg_check`** until it has no `refuse` finding. It stores nothing and runs no rehearsal, so iterate here, not with propose. `sql` alone is checked as one tx unit and will report `unit.expect_required` — a real change needs `units` with `expect`.
4. **Prepare it: `obto_pg_propose` once.** It stores the change and tries it on the real database; nothing is committed. Read `result.state`:
   - `rehearsed` — ready to apply. Tell the owner in plain words what changes, the lint warnings, the `catalogDiff`, and any units the rehearsal could not try (`rehearsal.noRehearsal`).
   - `refused` — a refuse finding; it never runs. Fix the SQL and propose a new change.
   - `rehearsal_failed` or `blocked_drift` — fix the cause, then `obto_pg_retry` the same change.
   - `waiting_rehearsal` — another rehearsal or apply holds the app, or the rehearsal cooldown is running; `obto_pg_retry` after `precheck.waiting.retryAfterMs`.
   - `service.still_running` (an error answer) — the call is still running on the server; follow it with `obto_pg_list` / `obto_pg_status` instead of proposing again.
5. **Apply after the owner's yes.** The first `obto_pg_apply` answers `client_yes_needed` with ONE question and applies nothing. Ask exactly that question, stop, and call `obto_pg_apply` again only after the owner's yes (20 s to 30 min later; sooner or later asks again). A change that drops or deletes says what is lost: never pick yes for the owner. Never apply a change because it passed lint. If the change or the schema moved in between, apply refuses or asks again: check and prepare again. One call works for about 20 s: `state: partial` with `run.stoppedBy: budget` means call apply again.
6. **Follow it to the end** with `obto_pg_status` (state, per-unit `run`, `ledgerSeq`). Done means: state `applied`, a `ledgerSeq`, each unit's `expect` true when you run it through `obto_pg_query`, and `obto_pg_drift` ok. `partial` or `failed` with an error carries `run.error` — report it to the user (the owner, or OBTO, decides the next step). Never tell the user a change is live before `obto_pg_status` says `applied`.

A rehearsal really runs on production (rolled back, but holding the same locks while it runs), and each app allows one rehearsal at a time with a cooldown after it, so never loop `propose` / `retry`. The whole rehearsal must finish within 15 s: a change with many units can run over, so split it into two changes (schema first, backfills in a second change once the first is applied). `obto_pg_noop_change` builds a change that changes nothing — useful to prove the pipeline end to end.

## Units: what commits together

- `tx` — one transaction; may hold several statements.
- `nontx` — exactly one statement that cannot run in a transaction: `CREATE/DROP INDEX CONCURRENTLY`, `ALTER TYPE … ADD VALUE`. A `CONCURRENTLY` index cannot be rehearsed: it is listed in `rehearsal.noRehearsal`; tell the owner before the yes.
- `backfill` — you give `{table, key, set, where, batchSize, pauseMs, maxBatches}`; the tool writes a batched, resumable `UPDATE`. It only updates.
- Every `tx` and `nontx` unit needs `expect`: one read-only `SELECT` returning one boolean, true once the unit is applied — it is how a stopped change resumes. `expect` and a backfill's `set` / `where` may call only built-in read functions.

**The rehearsal runs all units in one transaction that is rolled back, but apply commits each unit separately.** If unit 2 fails, unit 1 stays applied. So whatever must exist together goes in **one** tx unit — a new column, its comment, and the row that uses it. Split into several units only where a stop in between leaves the database in a state the app can live with. Two more splits are forced by lint: a `CONCURRENTLY` index always gets its own nontx unit, and one tx unit may take write-blocking locks on only one existing table (`tx.one_hot_table`).

## Saving data

`obto_pg_query` is read-only. Rows normally reach the database through the app's own code or API. When a change needs data of its own (for example a first row that uses a new column), put the `INSERT … VALUES` in the **same tx unit** as the DDL; it passes with the warning `dml.insert_existing` and goes through lint, rehearsal and the ledger like the DDL. Filling existing rows is a `backfill` unit.

## What the tool refuses today

Read `rule` in each finding; the ones clients hit most:

- **`DROP COLUMN`** (any drop or rename) — `drop.requires_contract`. A drop needs class `contract` and the full SQL parser, which this server does not have yet. Today the answer is: keep the column, or ask OBTO.
- **`DELETE`** — `dml.unbatched`. The message says "use a backfill unit", but a backfill can only `UPDATE`, so there is no tool path to delete rows today. Delete through the app's own API, or ask OBTO.
- Bulk `UPDATE` or `INSERT … SELECT` on an existing table — `dml.unbatched`; use a backfill unit.
- Anything the lint cannot classify — `recognizer.needs_parser`; it never runs. Rewrite it as simpler statements or ask OBTO.
- **Some tables of a live app accept only additive changes for now**: a new table, a nullable or defaulted column, a non-unique `CREATE INDEX CONCURRENTLY` in its own nontx unit. Anything else on them gets an `interim.*` rule: leave it to OBTO.
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

Before proposing, check that the `INSERT` supplies every NOT NULL column without a default. Run it through `obto_pg_check`, then `obto_pg_propose`, and report the `changeId` and state to the owner.
