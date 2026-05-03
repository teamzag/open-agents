function isZagRepo(
  repoOwner?: string | null,
  repoName?: string | null,
): boolean {
  return repoOwner === "teamzag" && repoName === "zag";
}

export function getSandboxCommandEnvForRepo(
  repoOwner?: string | null,
  repoName?: string | null,
): Record<string, string> | undefined {
  const env: Record<string, string> = {};

  if (isZagRepo(repoOwner, repoName)) {
    const dotenvPrivateKey = process.env.DOTENV_PRIVATE_KEY?.trim();
    if (dotenvPrivateKey) {
      env.DOTENV_PRIVATE_KEY = dotenvPrivateKey;
    }
  }

  return Object.keys(env).length > 0 ? env : undefined;
}
