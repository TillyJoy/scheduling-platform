const defaultTerminology = {
  auditor: {
    singular: "Auditor",
    plural: "Auditors",
    definition: "Person assigned to perform the scheduled service."
  },
  scheduler: {
    singular: "Scheduler",
    plural: "Schedulers",
    definition: "Person responsible for managing appointments."
  },
  client: {
    singular: "Client",
    plural: "Clients",
    definition: "Person receiving services."
  },
  property: {
    singular: "Property",
    plural: "Properties",
    definition: "Location associated with one or more service units."
  },
  zone: {
    singular: "Zone",
    plural: "Zones",
    definition: "Configured geographic or operational service area."
  },
  contractor: {
    singular: "Contractor",
    plural: "Contractors",
    definition: "External person or organization providing services."
  }
};

function getTerminology(customTerminology = {}) {
  return {
    ...defaultTerminology,
    ...customTerminology
  };
}

module.exports = {
  defaultTerminology,
  getTerminology
};
