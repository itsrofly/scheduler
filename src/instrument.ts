import * as Sentry from '@sentry/node';

const { SENTRY_DNS } = process.env;

if (SENTRY_DNS) {
  Sentry.init({
    dsn: SENTRY_DNS,

    // Send structured logs to Sentry
    enableLogs: true,
    // Tracing
    tracesSampleRate: 1.0, //  Capture 100% of the transactions
    // Setting this option to true will send default PII data to Sentry.
    // For example, automatic IP address collection on events
    sendDefaultPii: true,
  });
}
