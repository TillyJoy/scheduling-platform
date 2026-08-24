function getOrganizationContext(req) {
  const organizationId = req.headers["x-organization-id"] || null;

  return {
    organizationId
  };
}

function requireOrganization(req) {
  const context = getOrganizationContext(req);

  if (!context.organizationId) {
    return {
      authorized: false,
      error: "Organization context required"
    };
  }

  return {
    authorized: true,
    organizationId: context.organizationId
  };
}

module.exports = {
  getOrganizationContext,
  requireOrganization
};
