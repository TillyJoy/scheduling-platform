const cryptoApi = globalThis.crypto;
const DB_VERSION = 1;
const STORE_NAME = "operations";

class FieldExecutionOfflineQueue {
  constructor({ store, organizationId, actorUserId, deviceId, clock = () => new Date() } = {}) {
    if (!store) throw new Error("store is required");
    if (!organizationId) throw new Error("organizationId is required");
    if (!actorUserId) throw new Error("actorUserId is required");
    if (!deviceId) throw new Error("deviceId is required");
    this.store = store;
    this.organizationId = organizationId;
    this.actorUserId = actorUserId;
    this.deviceId = deviceId;
    this.clock = clock;
  }

  createOperation({ operationId = cryptoApi.randomUUID(), operationType, fieldVisitId = null, expectedVersion = null, payload = {}, occurredAt = this.clock() }) {
    if (!operationType) throw new Error("operationType is required");
    const occurred = new Date(occurredAt);
    const captured = new Date(this.clock());
    if (Number.isNaN(occurred.getTime()) || Number.isNaN(captured.getTime())) throw new Error("Operation timestamps must be valid dates");
    return {
      operationId,
      organizationId: this.organizationId,
      actorUserId: this.actorUserId,
      deviceId: this.deviceId,
      capturedAt: captured.toISOString(),
      occurredAt: occurred.toISOString(),
      expectedVersion,
      fieldVisitId,
      payload: structuredClone(payload)
    };
  }

  async enqueue(operation) {
    if (operation.organizationId !== this.organizationId || operation.actorUserId !== this.actorUserId || operation.deviceId !== this.deviceId) {
      throw new Error("Operation context does not match this queue");
    }
    await this.store.put({ ...structuredClone(operation), status: "pending", lastError: null });
    return operation;
  }

  async pending() {
    return this.store.list({ organizationId: this.organizationId, actorUserId: this.actorUserId, deviceId: this.deviceId, statuses: ["pending"] });
  }

  async all() {
    return this.store.list({ organizationId: this.organizationId, actorUserId: this.actorUserId, deviceId: this.deviceId });
  }

  async sync(send) {
    if (typeof send !== "function") throw new Error("send must be a function");
    const operations = await this.pending();
    if (operations.length === 0) return { applied: [], conflicts: [], rejected: [], remaining: await this.all() };

    const response = await send(operations);
    if (!response || !Array.isArray(response.results)) throw new Error("Invalid synchronization response");

    const byId = new Map(operations.map(operation => [operation.operationId, operation]));
    const applied = [];
    const conflicts = [];
    const rejected = [];

    for (const result of response.results) {
      const operation = byId.get(result.operationId);
      if (!operation) continue;
      if (result.status === "applied" || result.status === "duplicate") {
        await this.store.remove(operation.operationId);
        applied.push(result);
      } else if (result.status === "conflict") {
        await this.store.updateStatus(operation.operationId, "conflict", result.error);
        conflicts.push(result);
      } else {
        await this.store.updateStatus(operation.operationId, "rejected", result.error);
        rejected.push(result);
      }
    }

    return { applied, conflicts, rejected, remaining: await this.all() };
  }
}

class InMemoryOfflineOperationStore {
  constructor() { this.records = new Map(); }

  async put(record) { this.records.set(record.operationId, structuredClone(record)); }

  async list(filter) {
    return [...this.records.values()]
      .filter(record => !filter.organizationId || record.organizationId === filter.organizationId)
      .filter(record => !filter.actorUserId || record.actorUserId === filter.actorUserId)
      .filter(record => !filter.deviceId || record.deviceId === filter.deviceId)
      .filter(record => !filter.statuses || filter.statuses.includes(record.status))
      .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
      .map(record => structuredClone(record));
  }

  async remove(operationId) { this.records.delete(operationId); }

  async updateStatus(operationId, status, lastError) {
    const record = this.records.get(operationId);
    if (!record) return;
    record.status = status;
    record.lastError = lastError || null;
  }
}

class IndexedDbOfflineOperationStore {
  constructor({ databaseName = "scheduling-platform-field-execution", indexedDBFactory = globalThis.indexedDB } = {}) {
    if (!indexedDBFactory) throw new Error("IndexedDB is not available");
    this.databaseName = databaseName;
    this.indexedDBFactory = indexedDBFactory;
    this.dbPromise = this.#open();
  }

  async put(record) {
    const db = await this.dbPromise;
    return this.#request(db, "readwrite", store => store.put(record));
  }

  async list(filter) {
    const db = await this.dbPromise;
    return this.#request(db, "readonly", store => store.getAll()).then(records =>
      records
        .filter(record => !filter.organizationId || record.organizationId === filter.organizationId)
        .filter(record => !filter.actorUserId || record.actorUserId === filter.actorUserId)
        .filter(record => !filter.deviceId || record.deviceId === filter.deviceId)
        .filter(record => !filter.statuses || filter.statuses.includes(record.status))
        .sort((a, b) => a.capturedAt.localeCompare(b.capturedAt))
    );
  }

  async remove(operationId) {
    const db = await this.dbPromise;
    return this.#request(db, "readwrite", store => store.delete(operationId));
  }

  async updateStatus(operationId, status, lastError) {
    const db = await this.dbPromise;
    return this.#request(db, "readwrite", store => {
      const get = store.get(operationId);
      return new Promise((resolve, reject) => {
        get.onsuccess = () => {
          const record = get.result;
          if (!record) return resolve();
          record.status = status;
          record.lastError = lastError || null;
          const put = store.put(record);
          put.onsuccess = resolve;
          put.onerror = () => reject(put.error);
        };
        get.onerror = () => reject(get.error);
      });
    });
  }

  #open() {
    return new Promise((resolve, reject) => {
      const request = this.indexedDBFactory.open(this.databaseName, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: "operationId" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  #request(db, mode, operation) {
    return new Promise((resolve, reject) => {
      const options = mode === "readwrite" ? { durability: "strict" } : undefined;
      const transaction = options ? db.transaction(STORE_NAME, mode, options) : db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      let result;
      try {
        result = operation(store);
      } catch (error) {
        reject(error);
        return;
      }
      if (result && typeof result.then === "function") {
        result.then(resolve, reject);
      } else if (result && typeof result.onsuccess !== "undefined") {
        result.onsuccess = () => resolve(result.result);
        result.onerror = () => reject(result.error);
      } else {
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
      }
    });
  }
}

module.exports = { FieldExecutionOfflineQueue, InMemoryOfflineOperationStore, IndexedDbOfflineOperationStore };
