import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';

export function initializeTracing() {
  const prometheusExporter = new PrometheusExporter(
    {
      port: 9464,
      endpoint: '/metrics',
    },
    () => {
      console.log('Prometheus metrics exposed on http://localhost:9464/metrics');
    },
  );

  const sdk = new NodeSDK({
    metricReader: prometheusExporter,
    instrumentations: [
      getNodeAutoInstrumentations({
        '@opentelemetry/instrumentation-http': {
          ignoreIncomingRequestHook: (req) => {
            const url = req.url || '';
            return url.includes('/health') || url.includes('/metrics');
          },
        },
        '@opentelemetry/instrumentation-pg': {
          enhancedDatabaseReporting: true,
        },
        '@opentelemetry/instrumentation-redis': {
          enabled: true,
        },
      }),
    ],
  });

  sdk.start();

  process.on('SIGTERM', () => {
    sdk
      .shutdown()
      .then(() => console.log('OpenTelemetry SDK shut down'))
      .catch((error) => console.error('Error shutting down OpenTelemetry SDK', error));
  });

  return sdk;
}
