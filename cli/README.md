# zag-computer CLI

`zag-computer` opens a local cmux workspace attached to a running Vercel Sandbox from zag.computer.

Usage:

```sh
zag-computer <sandbox-name>
```

The workspace includes:

- main terminal tabs for `claude`, `codex`, and `shell`
- browser tabs for `landing` on port `3000` and `console` on port `3001`
- bottom tabs for `source-control`, `database`, `psql`, `server`, and `orchard-shell`

Vercel Sandbox `connect` is not SSH. It opens an interactive PTY session through Vercel's sandbox tunnel.

`zag-computer` copies small helper scripts into `/tmp` in the sandbox before opening cmux. Each sandbox terminal tab connects directly through Vercel's PTY tunnel and launches its command in `/vercel/sandbox`.

The `claude`, `codex`, `shell`, `source-control`, `database`, and `psql` tabs are intentionally direct terminals, not tmux sessions. That keeps copy/paste and mouse behavior normal for interactive tools.

The `server` tab manages a detached `pnpm dev` process through `.open-agents-dev-server-3000.pid` and `.open-agents-dev-server.log`. If the server is not running, the helper starts it. The tab then runs `tail -F` directly in cmux so server logs use normal terminal scrollback. The browser tabs keep using the same exposed sandbox port URLs.

The `orchard-shell` tab runs locally on your Mac, not inside the sandbox. By default it runs `make ssh-cp` from `~/zag/infra`, which SSHes into the Orchard control-plane host using the Zag infra Makefile. Override the repo path with `ZAG_COMPUTER_ZAG_REPO_DIR` or the command with `ZAG_COMPUTER_ORCHARD_COMMAND`.

## Prerequisites

- cmux: https://cmux.com/docs/getting-started
- Vercel Sandbox CLI, installed with `pnpm i -g sandbox` and logged in with `sandbox login`
- lazygit installed in the sandbox image/snapshot
- rainfrog installed in the sandbox image/snapshot, or network access so `zag-computer` can install the Linux musl release on first use
- repo dependencies installed with `bun install`, so the script can resolve sandbox preview URLs through the local `@vercel/sandbox` SDK
- `DOTENV_PRIVATE_KEY` injected into sandbox shells, so Rainfrog and the agent CLIs can read the repo's encrypted `.env`
- AWS credentials active locally for the Orchard tab. If needed, run `aws sso login` on your Mac.

## Add to PATH

From the repo root:

```sh
ln -s $(pwd)/cli/zag-computer /usr/local/bin/zag-computer
```

On Apple Silicon Macs using Homebrew's default prefix, `/opt/homebrew/bin` is often the better target:

```sh
ln -s $(pwd)/cli/zag-computer /opt/homebrew/bin/zag-computer
```

Then click `Attach via cmux` in zag.computer, paste the copied command into your terminal, and cmux will open the workspace.
