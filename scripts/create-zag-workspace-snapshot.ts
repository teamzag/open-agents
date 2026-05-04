import { connectSandbox } from "../packages/sandbox";
import {
  DEFAULT_SANDBOX_PORTS,
  DEFAULT_SANDBOX_RUNTIME,
  DEFAULT_SANDBOX_TIMEOUT_MS,
  DEFAULT_SANDBOX_VCPUS,
} from "../apps/web/lib/sandbox/config";

const REPO_URL = "https://github.com/teamzag/zag";
const COMMAND_TIMEOUT_MS = 45 * 60 * 1000;

type SnapshotSandbox = Awaited<ReturnType<typeof connectSandbox>>;

async function readCommand(command: string, args: string[]): Promise<string> {
  const proc = Bun.spawn([command, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with exit code ${exitCode}: ${stderr.trim()}`,
    );
  }

  return stdout.trim();
}

async function getGitHubToken(): Promise<string | undefined> {
  if (process.env.GITHUB_TOKEN) {
    return process.env.GITHUB_TOKEN;
  }

  if (process.env.GH_TOKEN) {
    return process.env.GH_TOKEN;
  }

  try {
    return await readCommand("gh", ["auth", "token"]);
  } catch {
    return undefined;
  }
}

function command(parts: string[]): string {
  return ["set -euo pipefail", ...parts].join("\n");
}

async function run(
  sandbox: SnapshotSandbox,
  label: string,
  script: string,
  cwd = sandbox.workingDirectory,
): Promise<void> {
  console.log(`\n==> ${label}`);
  const result = await sandbox.exec(script, cwd, COMMAND_TIMEOUT_MS);
  if (!result.success) {
    throw new Error(
      [
        `${label} failed with exit code ${result.exitCode}`,
        result.stdout.trim() ? `stdout:\n${result.stdout.trim()}` : null,
        result.stderr.trim() ? `stderr:\n${result.stderr.trim()}` : null,
      ]
        .filter((section): section is string => section !== null)
        .join("\n\n"),
    );
  }
  if (result.stdout.trim()) {
    console.log(result.stdout.trim());
  }
}

async function main() {
  const githubToken = await getGitHubToken();
  if (!githubToken) {
    throw new Error(
      "No GitHub token available. Run gh auth login or set GITHUB_TOKEN.",
    );
  }

  console.log("Creating Zag workspace snapshot sandbox...");
  const sandbox = await connectSandbox({
    state: { type: "vercel" },
    options: {
      githubToken,
      runtime: DEFAULT_SANDBOX_RUNTIME,
      timeout: DEFAULT_SANDBOX_TIMEOUT_MS,
      vcpus: DEFAULT_SANDBOX_VCPUS,
      ports: DEFAULT_SANDBOX_PORTS,
      persistent: false,
      skipGitWorkspaceBootstrap: true,
    },
  });

  try {
    await run(
      sandbox,
      "Install system tools",
      command([
        "sudo dnf install -y dnf-plugins-core git unzip zip jq findutils procps-ng which make gcc gcc-c++ python3 tar gzip xz lsof postgresql16",
        'ARCH="$(uname -m)"',
        'case "$ARCH" in x86_64) RG_ARCH=x86_64 ;; aarch64) RG_ARCH=aarch64 ;; *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; esac',
        "rm -rf /tmp/ripgrep-14.1.1-* /tmp/ripgrep.tar.gz",
        `curl -fsSL "https://github.com/BurntSushi/ripgrep/releases/download/14.1.1/ripgrep-14.1.1-\${RG_ARCH}-unknown-linux-musl.tar.gz" -o /tmp/ripgrep.tar.gz`,
        "tar -xzf /tmp/ripgrep.tar.gz -C /tmp",
        `sudo install -m 0755 /tmp/ripgrep-14.1.1-\${RG_ARCH}-unknown-linux-musl/rg /usr/local/bin/rg`,
        "sudo dnf config-manager --add-repo https://rpm.releases.hashicorp.com/AmazonLinux/hashicorp.repo || true",
        "sudo dnf install -y terraform packer",
      ]),
    );

    await run(
      sandbox,
      "Install terminal workflow tools",
      command([
        'mkdir -p "$HOME/.local/bin"',
        "cat > /tmp/zag-local-bin-path.sh <<'SH'",
        'export PATH="$HOME/.local/bin:$PATH"',
        "SH",
        "sudo install -m 0644 /tmp/zag-local-bin-path.sh /etc/profile.d/zag-local-bin-path.sh",
        'touch "$HOME/.bashrc" "$HOME/.zshrc"',
        'grep -qxF \'export PATH="$HOME/.local/bin:$PATH"\' "$HOME/.bashrc" || printf \'\\nexport PATH="$HOME/.local/bin:$PATH"\\n\' >> "$HOME/.bashrc"',
        'grep -qxF \'export PATH="$HOME/.local/bin:$PATH"\' "$HOME/.zshrc" || printf \'\\nexport PATH="$HOME/.local/bin:$PATH"\\n\' >> "$HOME/.zshrc"',
        'ARCH="$(uname -m)"',
        'case "$ARCH" in x86_64) LAZYGIT_ARCH=x86_64; RAINFOG_TARGET=x86_64-unknown-linux-musl ;; aarch64|arm64) LAZYGIT_ARCH=arm64; RAINFOG_TARGET=aarch64-unknown-linux-musl ;; *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; esac',
        `LAZYGIT_VERSION="\${LAZYGIT_VERSION:-0.61.1}"`,
        "rm -rf /tmp/lazygit-install /tmp/lazygit.tar.gz",
        "mkdir -p /tmp/lazygit-install",
        `curl -fsSL "https://github.com/jesseduffield/lazygit/releases/download/v\${LAZYGIT_VERSION}/lazygit_\${LAZYGIT_VERSION}_Linux_\${LAZYGIT_ARCH}.tar.gz" -o /tmp/lazygit.tar.gz`,
        "tar -xzf /tmp/lazygit.tar.gz -C /tmp/lazygit-install",
        "sudo install -m 0755 /tmp/lazygit-install/lazygit /usr/local/bin/lazygit",
        `RAINFOG_VERSION="\${RAINFOG_VERSION:-v0.3.18}"`,
        "rm -rf /tmp/rainfrog-install /tmp/rainfrog.tar.gz",
        "mkdir -p /tmp/rainfrog-install",
        `curl -fsSL "https://github.com/achristmascarl/rainfrog/releases/download/\${RAINFOG_VERSION}/rainfrog-\${RAINFOG_VERSION}-\${RAINFOG_TARGET}.tar.gz" -o /tmp/rainfrog.tar.gz`,
        "tar -xzf /tmp/rainfrog.tar.gz -C /tmp/rainfrog-install",
        "find /tmp/rainfrog-install -type f -perm -111 -name rainfrog -print -quit | xargs -I{} sudo install -m 0755 {} /usr/local/bin/rainfrog",
      ]),
    );

    await run(
      sandbox,
      "Install AWS CLI",
      command([
        'ARCH="$(uname -m)"',
        'case "$ARCH" in x86_64) AWS_ARCH=x86_64 ;; aarch64) AWS_ARCH=aarch64 ;; *) echo "unsupported arch: $ARCH" >&2; exit 1 ;; esac',
        "rm -rf /tmp/aws /tmp/awscliv2.zip",
        `curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-\${AWS_ARCH}.zip" -o /tmp/awscliv2.zip`,
        "unzip -q /tmp/awscliv2.zip -d /tmp",
        "sudo /tmp/aws/install --update",
      ]),
    );

    await run(
      sandbox,
      "Install Node CLIs",
      command([
        'sudo env "PATH=$PATH" npm install -g corepack agent-browser @tigrisdata/cli vercel neonctl @anthropic-ai/claude-code @openai/codex',
        "agent-browser install --with-deps",
      ]),
    );

    await run(
      sandbox,
      "Install code-server",
      command([
        "curl -fsSL https://code-server.dev/install.sh | sh",
        'if [ -x "$HOME/.local/bin/code-server" ]; then sudo ln -sf "$HOME/.local/bin/code-server" /usr/local/bin/code-server; fi',
        "code-server --install-extension GitHub.github-vscode-theme --force",
        "code-server --version",
      ]),
    );

    await run(
      sandbox,
      "Configure code-server defaults",
      command([
        'mkdir -p "$HOME/.local/share/code-server/User"',
        "cat > \"$HOME/.local/share/code-server/User/settings.json\" <<'JSON'",
        "{",
        '  "task.allowAutomaticTasks": "on",',
        '  "workbench.colorTheme": "GitHub Light Default",',
        '  "workbench.panel.defaultLocation": "right"',
        "}",
        "JSON",
      ]),
    );

    await run(
      sandbox,
      "Install Tigris convenience wrapper",
      command([
        "cat > /tmp/tigris-zag <<'SH'",
        "#!/usr/bin/env bash",
        "set -euo pipefail",
        `if [ -n "\${TIGRIS_ACCESS_KEY_ID:-}" ]; then export AWS_ACCESS_KEY_ID="$TIGRIS_ACCESS_KEY_ID"; fi`,
        `if [ -n "\${TIGRIS_SECRET_ACCESS_KEY:-}" ]; then export AWS_SECRET_ACCESS_KEY="$TIGRIS_SECRET_ACCESS_KEY"; fi`,
        `export AWS_REGION="\${TIGRIS_REGION:-auto}"`,
        'exec tigris "$@"',
        "SH",
        "sudo install -m 0755 /tmp/tigris-zag /usr/local/bin/tigris-zag",
      ]),
    );

    await run(
      sandbox,
      "Install agent CLI aliases",
      command([
        "cat > /tmp/zag-agent-aliases.sh <<'SH'",
        "# Zag agent convenience commands.",
        'cc() { pnpm exec dotenvx run -f .env -- claude "$@"; }',
        'skip() { pnpm exec dotenvx run -f .env -- claude --dangerously-skip-permissions "$@"; }',
        'ccd() { skip "$@"; }',
        "bypass() {",
        `  pnpm exec dotenvx run -f .env -- bash -lc 'set -euo pipefail; if [ -n "\${OPENAI_API_KEY:-}" ]; then printf "%s\\n" "$OPENAI_API_KEY" | codex login --with-api-key >/dev/null; fi; exec codex --dangerously-bypass-approvals-and-sandbox "$@"' _ "$@"`,
        "}",
        "SH",
        "sudo install -m 0644 /tmp/zag-agent-aliases.sh /etc/profile.d/zag-agent-aliases.sh",
        'touch "$HOME/.bashrc"',
        "grep -qxF 'source /etc/profile.d/zag-agent-aliases.sh' \"$HOME/.bashrc\" || printf '\\nsource /etc/profile.d/zag-agent-aliases.sh\\n' >> \"$HOME/.bashrc\"",
        'touch "$HOME/.zshrc"',
        "grep -qxF 'source /etc/profile.d/zag-agent-aliases.sh' \"$HOME/.zshrc\" || printf '\\nsource /etc/profile.d/zag-agent-aliases.sh\\n' >> \"$HOME/.zshrc\"",
      ]),
    );

    if (!sandbox.setGitHubAuthToken) {
      throw new Error("Sandbox does not support GitHub credential brokering.");
    }

    await sandbox.setGitHubAuthToken(githubToken);
    try {
      await run(
        sandbox,
        "Clone Zag with submodules",
        command([
          `git clone ${REPO_URL} .`,
          "git submodule update --init --recursive",
        ]),
      );
    } finally {
      await sandbox.setGitHubAuthToken(undefined);
    }

    await run(
      sandbox,
      "Install Zag dependencies",
      command([
        "corepack enable",
        "corepack prepare pnpm@9.15.4 --activate",
        "pnpm install --frozen-lockfile",
      ]),
    );

    await run(
      sandbox,
      "Verify snapshot toolchain",
      command([
        "node --version",
        "pnpm --version",
        "code-server --version | head -n 1",
        "agent-browser --version",
        "claude --version",
        "codex --version",
        "lazygit --version",
        "rainfrog --version",
        "psql --version",
        "bash -ic 'type skip && type ccd && type cc && type bypass'",
        "terraform version | head -n 1",
        "packer version | head -n 1",
        "aws --version",
        "tigris --version",
        "neonctl --version",
        "vercel --version",
        "git submodule status --recursive",
        "test -d node_modules",
      ]),
    );

    if (!sandbox.snapshot) {
      throw new Error(
        "Configured sandbox provider does not support snapshots.",
      );
    }

    console.log("\n==> Creating non-expiring snapshot");
    const snapshot = await sandbox.snapshot({ expiration: 0 });
    console.log(`Zag workspace snapshot id: ${snapshot.snapshotId}`);
  } catch (error) {
    try {
      await sandbox.stop();
    } catch {
      // Snapshot creation stops the sandbox automatically; cleanup is best effort.
    }
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
