const assert = require("node:assert/strict");
const test = require("node:test");
const { MondayIntegrationAdapter } = require("../src/services/mondayIntegrationAdapter");

const integration = {
  provider: "monday.com",
  active: true
};

const configuration = {
  boards: {
    centralVetting: {
      id: 12345,
      columns: {
        clientName: { columnId: "name" },
        zone: { columnId: "zone_col" },
        serviceStatus: {
          type: "mirror",
          columnId: "status_col",
          sourceColumnId: "status_source"
        }
      }
    }
  }
};

test("maps Monday item columns to configured internal fields", () => {
  const adapter = new MondayIntegrationAdapter({
    client: {},
    integration,
    configuration
  });

  const mapped = adapter.readItem({
    boardKey: "centralVetting",
    item: {
      id: 99,
      name: "48 Oak Street",
      column_values: [
        { id: "zone_col", text: "North" },
        { id: "status_col", display_value: "Ready to Schedule", value: "{\"index\":1}" }
      ]
    }
  });

  assert.deepEqual(mapped, {
    externalId: "99",
    boardId: "12345",
    boardKey: "centralVetting",
    fields: {
      clientName: "48 Oak Street",
      zone: "North",
      serviceStatus: "Ready to Schedule"
    }
  });
});

test("writes mirror-backed fields to the resolved source column and item", async () => {
  const writes = [];
  const resolutions = [];
  const adapter = new MondayIntegrationAdapter({
    client: {
      async resolveMirrorSource(source) {
        resolutions.push(source);
        return {
          boardId: 67890,
          itemId: 777,
          columnId: "status_source"
        };
      },
      async changeColumnValue(write) {
        writes.push(write);
      }
    },
    integration,
    configuration
  });

  const result = await adapter.writeFields({
    boardKey: "centralVetting",
    itemId: 99,
    fields: {
      serviceStatus: "Scheduled",
      zone: "South",
      unknownField: "ignored"
    }
  });

  assert.deepEqual(resolutions, [
    {
      boardId: "12345",
      itemId: "99",
      mirrorColumnId: "status_col",
      sourceColumnId: "status_source"
    }
  ]);
  assert.deepEqual(result, [
    {
      boardId: "67890",
      itemId: "777",
      columnId: "status_source",
      value: "Scheduled"
    },
    {
      boardId: "12345",
      itemId: "99",
      columnId: "zone_col",
      value: "South"
    }
  ]);
  assert.deepEqual(writes, result);
});

test("rejects mirror mappings without a source column", async () => {
  const adapter = new MondayIntegrationAdapter({
    client: {
      async resolveMirrorSource() {
        throw new Error("resolver should not be called");
      }
    },
    integration,
    configuration: {
      boards: {
        centralVetting: {
          id: 12345,
          columns: {
            serviceStatus: { type: "mirror", columnId: "status_col" }
          }
        }
      }
    }
  });

  await assert.rejects(
    adapter.writeFields({
      boardKey: "centralVetting",
      itemId: 99,
      fields: { serviceStatus: "Scheduled" }
    }),
    /source column configured/
  );
});

test("rejects unresolved mirror sources", async () => {
  const adapter = new MondayIntegrationAdapter({
    client: {
      async resolveMirrorSource() {
        return null;
      }
    },
    integration,
    configuration
  });

  await assert.rejects(
    adapter.writeFields({
      boardKey: "centralVetting",
      itemId: 99,
      fields: { serviceStatus: "Scheduled" }
    }),
    /source could not be resolved/
  );
});

test("preserves columnId fallback for non-mirror mappings", async () => {
  const writes = [];
  const adapter = new MondayIntegrationAdapter({
    client: {
      async changeColumnValue(write) {
        writes.push(write);
      }
    },
    integration,
    configuration: {
      boards: {
        centralVetting: {
          id: 12345,
          columns: {
            zone: { columnId: "zone_col" }
          }
        }
      }
    }
  });

  await adapter.writeFields({
    boardKey: "centralVetting",
    itemId: 99,
    fields: { zone: "South" }
  });

  assert.deepEqual(writes, [
    {
      boardId: "12345",
      itemId: "99",
      columnId: "zone_col",
      value: "South"
    }
  ]);
});

test("prevents read options from overriding the selected board", async () => {
  let request;
  const adapter = new MondayIntegrationAdapter({
    client: {
      async getBoardItems(options) {
        request = options;
        return [];
      }
    },
    integration,
    configuration
  });

  await adapter.readBoardItems({
    boardKey: "centralVetting",
    boardId: "99999",
    limit: 10
  });

  assert.deepEqual(request, {
    boardId: "12345",
    limit: 10
  });
});

test("rejects inactive Monday integrations before reading or writing", async () => {
  const adapter = new MondayIntegrationAdapter({
    client: {},
    integration: { provider: "monday.com", active: false },
    configuration
  });

  assert.throws(
    () => adapter.readItem({
      boardKey: "centralVetting",
      item: { id: 1, name: "Example" }
    }),
    /not active/
  );

  await assert.rejects(
    adapter.writeFields({
      boardKey: "centralVetting",
      itemId: 1,
      fields: { zone: "North" }
    }),
    /not active/
  );
});

test("rejects missing board configuration", async () => {
  const adapter = new MondayIntegrationAdapter({
    client: {},
    integration,
    configuration
  });

  await assert.rejects(
    adapter.readBoardItems({ boardKey: "missing" }),
    /configuration not found/
  );
});
