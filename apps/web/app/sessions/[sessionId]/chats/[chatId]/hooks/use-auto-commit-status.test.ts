import { describe, expect, test } from "bun:test";
import { reconcileOptimisticPostTurnPhase } from "./use-auto-commit-status";

describe("reconcileOptimisticPostTurnPhase", () => {
  test("clears optimistic auto-commit once git work is done", () => {
    expect(
      reconcileOptimisticPostTurnPhase({
        sessionPostTurnPhase: null,
        optimisticPhase: "auto_commit",
        hasExistingPr: false,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
      }),
    ).toBeNull();
  });

  test("keeps optimistic auto-commit while git work is still pending", () => {
    expect(
      reconcileOptimisticPostTurnPhase({
        sessionPostTurnPhase: null,
        optimisticPhase: "auto_commit",
        hasExistingPr: false,
        hasUncommittedChanges: true,
        hasUnpushedCommits: false,
      }),
    ).toBe("auto_commit");
  });

  test("clears optimistic auto-pr once the PR appears", () => {
    expect(
      reconcileOptimisticPostTurnPhase({
        sessionPostTurnPhase: null,
        optimisticPhase: "auto_pr",
        hasExistingPr: true,
        hasUncommittedChanges: false,
        hasUnpushedCommits: false,
      }),
    ).toBeNull();
  });
});
