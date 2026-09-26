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
        serviceStatus: { columnId: "status_col", sourceColumnId: "status_source" }
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

test("writes mirror-backed fields to the configured source column", async () => {
  const writes = [];
  const adapter = new MondayIntegrationAdapter({
    client: {
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

  assert.deepEqual(result, [
    {
      boardId: "12345",
      itemId: "99",
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

test("rejects missing board configuration", () => {
  const adapter = new MondayIntegrationAdapter({
    client: {},
    integration,
    configuration
  });

  assert.throws(
    () => adapter.readBoardItems({ boardKey: "missing" }),
    /configuration not found/
  );
});
