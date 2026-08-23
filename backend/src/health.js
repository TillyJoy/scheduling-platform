function healthCheck() {
  return {
    status: "ok",
    service: "scheduling-platform-api"
  };
}

module.exports = { healthCheck };
