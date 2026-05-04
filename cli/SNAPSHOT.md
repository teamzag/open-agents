# Zag Computer Sandbox Snapshot Notes

These are the items we want baked into the custom Vercel Sandbox snapshot for `teamzag/zag` so every `zag-computer` workspace starts ready.

## Installed Tools

- `lazygit` for the Source Control tab.
- `rainfrog` for the Database tab. Use the Linux musl release binary in Vercel Sandboxes; the GNU binary currently requires newer glibc than Amazon Linux 2023 provides.
- Add `$HOME/.local/bin` to shell `PATH`, because that is where `zag-computer` installs Rainfrog when it has to bootstrap it on first use.
- `postgresql16` / `psql` for the `psql` tab. Rainfrog remains the default database UI in the `database` tab.
- Tigris CLI for storage work.

## Secrets And Environment

- Inject `DOTENV_PRIVATE_KEY` into sandbox shells so `dotenvx run -f .env -- ...` can decrypt repo secrets.
- Keep the key out of visible command strings and terminal tab titles.
- The Database tab expects `DATABASE_URL`, `POSTGRES_URL`, or `NEON_DATABASE_URL` to be available after `dotenvx` decrypts `.env`.

## Runtime Defaults

- Pre-clone `teamzag/zag` into `/vercel/sandbox`.
- Run `pnpm install` during snapshot creation.
- Bake the `zag-computer` helper scripts or keep `/tmp` writable so the CLI can copy fresh helper scripts in before opening cmux.
- Keep the Zag shell aliases available:
  - `skip`
  - `ccd`
  - `cc`
  - `bypass`

## Dev Workflow

- The cmux `server` tab should manage a detached `pnpm dev` process through `.open-agents-dev-server-3000.pid`.
- If `pnpm dev` is not running, start it detached and write output to `.open-agents-dev-server.log`.
- If `pnpm dev` is already running, leave it alone and tail `.open-agents-dev-server.log`.
- The `server` tab should use direct cmux terminal scrollback, not tmux, so mouse scrolling works normally.
- Landing (`3000`) and Console (`3001`) browser URLs should keep working because the sandbox routes are port-based.
