function router(req) {
  if (req.url === "/health") {
    return { route: "health" };
  }

  if (req.url === "/database") {
    return { route: "database" };
  }

  return { route: "not-found" };
}

module.exports = { router };
