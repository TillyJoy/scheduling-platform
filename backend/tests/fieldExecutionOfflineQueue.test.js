const test = require("node:test");
const assert = require("node:assert/strict");
const {
  FieldExecutionOfflineQueue,
  InMemoryOfflineOperationStore
} = require("../../frontend/src/fieldExecutionOfflineQueue");

function queue() {
  let now = new Date("2026-10-01T10:00:05Z");
  const store = new InMemoryOfflineOperationStore();
  return {
    store,
    queue: new FieldExecutionOfflineQueue({
      store,
      organizationId: "org-a",
      actorUserId: "worker-1",
      deviceId: "device-1",
      clock: () => now
    }),
    setNow(value) { now = new Date(value); }
  };
}

test("offline queue captures identity, device, and both timestamps before synchronization", async () => {
  const { queue } = queue();
  const operation = queue.createOperation({
    operationId: "op-1",
    operationType: "fieldVisit.arrive",
    fieldVisitId: "visit-1",
    expectedVersion: 1,
    occurredAt: "2026-10-01T10:00:00Z",
    payload: { statusCode: "arrived" }
  });
  await queue.enqueue(operation);
  const pending = await queue.pending();

  assert.equal(pending.length, 1);
  assert.equal(pending[0].actorUserId, "worker-1");
  assert.equal(pending[0].deviceId, "device-1");
  assert.equal(pending[0].capturedAt, "2026-10-01T10:00:05.000Z");
  assert.equal(pending[0].occurredAt, "2026-10-01T10:00:00.000Z");
});

test("successful synchronization removes applied operations and retains partial failures", async () => {
  const { queue } = queue();
  await queue.enqueue(queue.createOperation({
    operationId: "op-applied",
    operationType: "fieldVisit.arrive",
    fieldVisitId: "visit-1",
    expectedVersion: 1,
    occurredAt: "2026-10-01T10:00:00Z"
  }));
  await queue.enqueue(queue.createOperation({
    operationId: "op-conflict",
    operationType: "fieldVisit.stop",
    fieldVisitId: "visit-1",
    expectedVersion: 2,
    occurredAt: "2026-10-01T10:30:00Z"
  }));

  const result = await queue.sync(async operations => ({
    results: operations.map(operation => ({
      operationId: operation.operationId,
      status: operation.operationId === "op-applied" ? "applied" : "conflict",
      error: operation.operationId === "op-conflict" ? "stale version" : undefined
    }))
  }));

  assert.equal(result.applied.length, 1);
  assert.equal(result.conflicts.length, 1);
  assert.equal(result.remaining.length, 1);
  assert.equal(result.remaining[0].operationId, "op-conflict");
  assert.equal(result.remaining[0].status, "conflict");
});

test("network failure leaves the queue unchanged for a later retry", async () => {
  const { queue } = queue();
  await queue.enqueue(queue.createOperation({
    operationId: "op-retry",
    operationType: "fieldVisit.start",
    fieldVisitId: "visit-1",
    expectedVersion: 2,
    occurredAt: "2026-10-01T10:15:00Z"
  }));

  await assert.rejects(() => queue.sync(async () => {
    throw new Error("network unavailable");
  }), /network unavailable/);

  assert.equal((await queue.pending()).length, 1);
});

test("queue isolates operations by organization, actor, and device context", async () => {
  const { queue, store } = queue();
  await queue.enqueue(queue.createOperation({
    operationId: "op-private",
    operationType: "fieldVisit.arrive",
    fieldVisitId: "visit-1",
    expectedVersion: 1,
    occurredAt: "2026-10-01T10:00:00Z"
  }));

  const otherQueue = new FieldExecutionOfflineQueue({
    store,
    organizationId: "org-b",
    actorUserId: "worker-2",
    deviceId: "device-2"
  });
  assert.deepEqual(await otherQueue.pending(), []);
});
