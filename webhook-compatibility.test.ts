import { afterEach, expect, it } from "vitest";
import { runDetachedWebhookWork } from "./webhook-request-guards.js";
import {
  getActiveGatewayRootWorkCount,
  resetGatewayWorkAdmission,
  tryBeginGatewayRootWorkAdmission,
} from "../process/gateway-work-admission.js";
import { AsyncWorkScope, getAsyncWorkSignal, trackAsyncWork } from "../shared/async-work-scope.js";
import { createDeferredCore } from "../shared/deferred.js";

afterEach(() => resetGatewayWorkAdmission());

it("preserves the public webhook helper's inherited requester cancellation", async () => {
  const parent = new AsyncWorkScope();
  const root = tryBeginGatewayRootWorkAdmission("test:webhook-compatibility");
  if (!root) throw new Error("Expected root admission");
  const entered = createDeferredCore();
  const release = createDeferredCore();
  const reason = new Error("synthetic requester cancellation");
  let callbackSignal: AbortSignal | undefined;
  const order: string[] = [];
  const work = root.run(async () => parent.run(() => {
    const result = runDetachedWebhookWork(async () => {
      order.push("callback");
      callbackSignal = getAsyncWorkSignal();
      entered.resolve();
      await release.promise;
      return trackAsyncWork(() => "late tracked work");
    });
    order.push("ack");
    return result;
  }));
  const outcome = work.then(value => ({ value, error: undefined }), error => ({ value: undefined, error }));
  try {
    await entered.promise;
    expect(order).toEqual(["ack", "callback"]);
    const inherited = callbackSignal === parent.signal;
    root.release();
    parent.beginClose(reason);
    await parent.drain();
    release.resolve();
    const result = await outcome;
    await expect.poll(() => getActiveGatewayRootWorkCount()).toBe(0);
    console.log("WEBHOOK_COMPATIBILITY_RECEIPT", JSON.stringify({
      inherited,
      aborted: callbackSignal?.aborted,
      sameReason: callbackSignal?.reason === reason,
      lateError: result.error instanceof Error ? result.error.message : null,
      value: result.value,
      roots: getActiveGatewayRootWorkCount(),
      order,
    }));
    expect(inherited).toBe(true);
    expect(callbackSignal?.aborted).toBe(true);
    expect(callbackSignal?.reason).toBe(reason);
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error.message).toBe("Async work scope is closed");
  } finally {
    release.resolve();
    root.release();
    await outcome;
    await parent.drain();
  }
});
