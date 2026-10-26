class IdentityService {
  constructor({ identityRepository, transaction } = {}) {
    if (!identityRepository) throw new Error("identityRepository is required");
    if (typeof transaction !== "function") throw new Error("transaction is required");
    this.identityRepository = identityRepository;
    this.transaction = transaction;
  }

  resolvePrincipal({ userId, organizationId } = {}) {
    if (!userId || !organizationId) return Promise.resolve(null);
    return this.transaction(
      { userId, organizationId },
      "identity.resolve_principal",
      db => this.identityRepository.resolvePrincipal({ userId, organizationId, db })
    );
  }

  resolveExternalIdentity({ provider, issuer, subject, organizationId } = {}) {
    if (!provider || !issuer || !subject || !organizationId) return Promise.resolve(null);
    return this.transaction(
      { userId: "identity-resolution", organizationId },
      "identity.resolve_external_identity",
      db => this.identityRepository.resolveExternalIdentity({
        provider, issuer, subject, organizationId, db
      })
    );
  }
}

module.exports = { IdentityService };
