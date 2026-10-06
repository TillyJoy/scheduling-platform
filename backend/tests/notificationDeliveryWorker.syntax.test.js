const { execFileSync } = require('node:child_process');
const files = [
  'backend/src/services/notificationDeliveryWorker.js',
  'backend/src/services/notificationProviderRegistry.js',
  'backend/src/repositories/notificationDeliveryAttemptRepository.js',
  'backend/src/repositories/domainEventOutboxRepository.js',
  'backend/src/models/notificationDeliveryAttempt.js',
  'backend/src/services/notificationEventProcessor.js',
  'backend/src/app.js',
  'backend/src/index.js',
  'backend/tests/notificationDeliveryWorker.integration.test.js'
];
for (const file of files) execFileSync(process.execPath, ['--check', file], {stdio:'inherit'});
console.log('syntax checks passed');