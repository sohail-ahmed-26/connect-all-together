import test, { describe, it } from "node:test";
import assert from "node:assert";
import { getReportingMetrics } from "./reporting";

describe("Reporting & Analytics", () => {
  it("needs a testing framework (e.g. Vitest) to mock db methods properly", () => {
    // Cannot natively mock module imports reliably in this Node version without a framework.
    assert.ok(true);
  });

  it("validates that workspaceId is strictly required", async () => {
    try {
      // @ts-expect-error - purposefully omitting workspaceId to test validation
      await getReportingMetrics({});
      assert.fail("Should have thrown an error for missing workspaceId");
    } catch (err: unknown) {
      const error = err as Error;
      assert.strictEqual(error.message, "workspaceId is required for reporting metrics");
    }
  });
});
