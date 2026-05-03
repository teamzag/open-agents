/**
 * Sandbox timeout configuration.
 * All timeout values are in milliseconds.
 */

/** SDK safety buffer reserved for sandbox before-stop hooks (30 seconds) */
const VERCEL_SANDBOX_TIMEOUT_BUFFER_MS = 30 * 1000;

/** Default timeout for new cloud sandboxes (5 hours minus hook buffer) */
export const DEFAULT_SANDBOX_TIMEOUT_MS =
  5 * 60 * 60 * 1000 - VERCEL_SANDBOX_TIMEOUT_BUFFER_MS;

function getSandboxVcpus(): number {
  const parsed = Number.parseInt(process.env.VERCEL_SANDBOX_VCPUS ?? "", 10);
  if (Number.isInteger(parsed) && parsed >= 1 && parsed <= 8) {
    return parsed;
  }

  return 8;
}

/** Default vCPU allocation for newly created cloud sandboxes. */
export const DEFAULT_SANDBOX_VCPUS = getSandboxVcpus();

type SandboxRuntime = "node22" | "node24" | "python3.13";

function getSandboxRuntime(): SandboxRuntime {
  const value = process.env.VERCEL_SANDBOX_RUNTIME?.trim();
  if (value === "node22" || value === "node24" || value === "python3.13") {
    return value;
  }

  return "node24";
}

/** Default runtime for newly created cloud sandboxes. */
export const DEFAULT_SANDBOX_RUNTIME = getSandboxRuntime();

/** Manual extension duration for explicit fallback flows (20 minutes) */
export const EXTEND_TIMEOUT_DURATION_MS = 20 * 60 * 1000;

/** Inactivity window before lifecycle hibernates an idle sandbox (30 minutes) */
export const SANDBOX_INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;

/** Buffer for sandbox expiry checks (10 seconds) */
export const SANDBOX_EXPIRES_BUFFER_MS = 10 * 1000;

/** Grace window before treating a lifecycle run as stale (2 minutes) */
export const SANDBOX_LIFECYCLE_STALE_RUN_GRACE_MS = 2 * 60 * 1000;

/** Minimum sleep between lifecycle workflow loop iterations (5 seconds) */
export const SANDBOX_LIFECYCLE_MIN_SLEEP_MS = 5 * 1000;

/**
 * Default ports to expose from cloud sandboxes.
 * Limited to 5 ports. Covers the most common framework defaults
 * plus the built-in code editor:
 * - 3000: Next.js, Express, Remix
 * - 3001: Zag console Next.js app
 * - 3002: Zag internal Next.js app
 * - 5173: Vite, SvelteKit
 * - 8000: code-server (built-in editor)
 */
export const DEFAULT_SANDBOX_PORTS = [3000, 3001, 3002, 5173, 8000];
export const CODE_SERVER_PORT = 8000;

/** Default working directory for sandboxes, used for path display */
export const DEFAULT_WORKING_DIRECTORY = "/vercel/sandbox";

function getSandboxBaseSnapshotId(): string | undefined {
  const value = process.env.VERCEL_SANDBOX_BASE_SNAPSHOT_ID?.trim();
  return value ? value : undefined;
}

/**
 * Optional base snapshot for fresh cloud sandboxes.
 * Snapshot IDs are scoped to the Vercel project/team that created them, so forks
 * must opt into their own snapshot instead of using the upstream project's ID.
 */
export const DEFAULT_SANDBOX_BASE_SNAPSHOT_ID = getSandboxBaseSnapshotId();

function getWorkspaceSnapshotId(): string | undefined {
  const value = process.env.VERCEL_SANDBOX_WORKSPACE_SNAPSHOT_ID?.trim();
  return value ? value : undefined;
}

function getWorkspaceSnapshotRepo(): string | undefined {
  const value = process.env.VERCEL_SANDBOX_WORKSPACE_REPO?.trim();
  return value ? value : undefined;
}

/** Optional pre-cloned workspace snapshot used for a specific repository. */
export const DEFAULT_SANDBOX_WORKSPACE_SNAPSHOT_ID = getWorkspaceSnapshotId();
export const DEFAULT_SANDBOX_WORKSPACE_REPO = getWorkspaceSnapshotRepo();

export const DEFAULT_SANDBOX_WORKSPACE_SETUP_COMMAND =
  "git submodule sync --recursive && git submodule update --init --recursive && corepack enable && corepack prepare pnpm@9.15.4 --activate && pnpm install --frozen-lockfile --prefer-offline";

export function getWorkspaceSnapshotIdForRepo(
  repoOwner?: string | null,
  repoName?: string | null,
): string | undefined {
  if (!DEFAULT_SANDBOX_WORKSPACE_SNAPSHOT_ID) {
    return undefined;
  }

  if (!repoOwner || !repoName || !DEFAULT_SANDBOX_WORKSPACE_REPO) {
    return undefined;
  }

  return DEFAULT_SANDBOX_WORKSPACE_REPO === `${repoOwner}/${repoName}`
    ? DEFAULT_SANDBOX_WORKSPACE_SNAPSHOT_ID
    : undefined;
}
