class MondayIntegrationAdapter {
  constructor({ client, integration, configuration = {} } = {}) {
    if (!client) throw new Error("Monday client is required");
    if (!integration) throw new Error("Integration is required");
    this.client = client;
    this.integration = integration;
    this.configuration = configuration;
  }

  readItem({ boardKey, item }) {
    this.#requireActive();
    const board = this.#board(boardKey);
    if (!item?.id) throw new Error("Monday item is required");

    const fields = {};
    for (const [internalField, mapping] of Object.entries(board.columns || {})) {
      fields[internalField] = this.#readColumn(item, mapping);
    }

    return {
      externalId: String(item.id),
      boardId: String(board.id),
      boardKey,
      fields
    };
  }

  async writeFields({ boardKey, itemId, fields }) {
    this.#requireActive();
    const board = this.#board(boardKey);
    if (!itemId) throw new Error("Monday item ID is required");
    if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
      throw new Error("fields must be an object");
    }

    const writes = [];
    for (const [internalField, value] of Object.entries(fields)) {
      const mapping = board.columns?.[internalField];
      if (!mapping) continue;

      const columnId = mapping.sourceColumnId || mapping.columnId;
      if (!columnId) throw new Error(`No writable Monday column configured for ${internalField}`);

      writes.push({
        boardId: String(board.id),
        itemId: String(itemId),
        columnId: String(columnId),
        value
      });
    }

    for (const write of writes) {
      await this.client.changeColumnValue(write);
    }

    return writes;
  }

  async readBoardItems({ boardKey, ...options } = {}) {
    this.#requireActive();
    const board = this.#board(boardKey);
    return this.client.getBoardItems({
      boardId: String(board.id),
      ...options
    });
  }

  #board(boardKey) {
    const board = this.configuration.boards?.[boardKey];
    if (!board?.id) throw new Error(`Monday board configuration not found: ${boardKey}`);
    return board;
  }

  #readColumn(item, mapping) {
    if (mapping.columnId === "name") {
      return item.name ?? null;
    }

    const column = (item.column_values || []).find(
      candidate => String(candidate.id) === String(mapping.columnId)
    );
    if (!column) return null;

    if (Object.prototype.hasOwnProperty.call(column, "display_value")) {
      return column.display_value;
    }
    if (Object.prototype.hasOwnProperty.call(column, "text")) {
      return column.text;
    }
    return column.value ?? null;
  }

  #requireActive() {
    if (this.integration.provider !== "monday.com") {
      throw new Error("Integration provider must be monday.com");
    }
    if (!this.integration.active) {
      throw new Error("Monday.com integration is not active");
    }
  }
}

module.exports = { MondayIntegrationAdapter };
