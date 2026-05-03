import { afterEach, describe, expect, test } from "bun:test";
import { getSandboxCommandEnvForRepo } from "./session-env";

const originalEnv = {
  DOTENV_PRIVATE_KEY: process.env.DOTENV_PRIVATE_KEY,
};

afterEach(() => {
  for (const [name, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

describe("getSandboxCommandEnvForRepo", () => {
  test("injects the Zag dotenvx private key when configured", () => {
    process.env.DOTENV_PRIVATE_KEY = "dotenv-key";

    expect(getSandboxCommandEnvForRepo("teamzag", "zag")).toEqual({
      DOTENV_PRIVATE_KEY: "dotenv-key",
    });
  });

  test("does not inject env into unrelated repos", () => {
    process.env.DOTENV_PRIVATE_KEY = "dotenv-key";

    expect(getSandboxCommandEnvForRepo("vercel-labs", "open-agents")).toBe(
      undefined,
    );
  });

  test("omits blank env values", () => {
    process.env.DOTENV_PRIVATE_KEY = " ";

    expect(getSandboxCommandEnvForRepo("teamzag", "zag")).toBe(undefined);
  });
});
