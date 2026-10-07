# SourceSpec catalog skills

`sspc-functions-catalog` and `sspc-tests-catalog` are agent-facing wrappers around the [SourceSpec CLI](../cli/README.md). They carry instructions and review boundaries, not their own dependencies, generators, tests, or schema copies. Humans can run the same CLI commands without the skills.

Schema templates live in [`../schema/`](../schema/); the installer places them alongside the CLI at `~/.sourcespec/schema/`, and all apps validate against those shared installed schemas. Edit and test CLI behavior in [`../cli/`](../cli/); update the installed workspace skill instructions when their command or review workflow changes. Catalog IDs and links require review even when a generated inventory passes its checks. One-off reconciliation scripts belong outside the skills and CLI.
