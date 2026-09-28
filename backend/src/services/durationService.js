class DurationService {
  constructor({ services = [], rules = [] } = {}) {
    this.services = services;
    this.rules = rules;
  }

  calculate({
    organizationId,
    serviceIds = [],
    funderId = null,
    unitCount = 0,
    propertyType = null
  } = {}) {
    if (!organizationId) throw new Error("organizationId is required");
    if (!Array.isArray(serviceIds) || serviceIds.length === 0) {
      throw new Error("serviceIds must not be empty");
    }
    if (new Set(serviceIds).size !== serviceIds.length) {
      throw new Error("serviceIds must not contain duplicates");
    }
    if (!Number.isInteger(unitCount) || unitCount < 0) {
      throw new Error("unitCount must be a non-negative integer");
    }

    const normalizedIds = [...serviceIds].sort();
    const organizationServices = this.services.filter(service => service.organizationId === organizationId);
    const organizationRules = this.rules.filter(rule => rule.organizationId === organizationId);
    const serviceMap = new Map(organizationServices.map(service => [service.id, service]));
    for (const serviceId of normalizedIds) {
      const service = serviceMap.get(serviceId);
      if (!service || service.active === false) {
        throw new Error(`Service not found or inactive: ${serviceId}`);
      }
    }

    const matchingRules = organizationRules
      .filter(rule => this.#matches(rule, normalizedIds, funderId, unitCount, propertyType))
      .sort((a, b) => this.#compareSpecificity(a, b));

    const rule = matchingRules[0];
    if (rule) return rule.durationMinutes;

    let duration = 0;
    for (const serviceId of normalizedIds) {
      const service = serviceMap.get(serviceId);
      if (!Number.isInteger(service.durationMinutes) || service.durationMinutes <= 0) {
        throw new Error(`Service duration is not configured: ${serviceId}`);
      }
      duration += service.durationMinutes;
    }
    return duration;
  }

  #matches(rule, serviceIds, funderId, unitCount, propertyType) {
    const ruleIds = [...new Set(rule.serviceIds || [])].sort();
    if (ruleIds.length !== serviceIds.length || ruleIds.some((id, index) => id !== serviceIds[index])) return false;
    if (rule.funderId !== undefined && rule.funderId !== funderId) return false;
    if (rule.propertyType !== undefined && rule.propertyType !== propertyType) return false;
    if (rule.minUnitCount !== undefined && unitCount < rule.minUnitCount) return false;
    if (rule.maxUnitCount !== undefined && unitCount > rule.maxUnitCount) return false;
    if (!Number.isInteger(rule.durationMinutes) || rule.durationMinutes <= 0) return false;
    return true;
  }

  #compareSpecificity(a, b) {
    const scoreDifference = this.#specificity(b) - this.#specificity(a);
    if (scoreDifference !== 0) return scoreDifference;

    const aHasMin = a.minUnitCount !== undefined;
    const bHasMin = b.minUnitCount !== undefined;
    const aHasMax = a.maxUnitCount !== undefined;
    const bHasMax = b.maxUnitCount !== undefined;

    if (aHasMin && bHasMin && a.minUnitCount !== b.minUnitCount) {
      return b.minUnitCount - a.minUnitCount;
    }
    if (aHasMax && bHasMax && a.maxUnitCount !== b.maxUnitCount) {
      return a.maxUnitCount - b.maxUnitCount;
    }
    return 0;
  }

  #specificity(rule) {
    let score = 0;
    if (rule.funderId !== undefined) score += 4;
    if (rule.propertyType !== undefined) score += 2;
    if (rule.minUnitCount !== undefined || rule.maxUnitCount !== undefined) score += 1;
    return score;
  }
}

module.exports = { DurationService };
