import pino from "pino";
import { LokiOptions } from "pino-loki";

export default function logger(app: string) {
  const lokiUrl = process.env.LOKI_URL;

  const options: pino.LoggerOptions = {
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    base: {
      app,
    },
  };

  if (lokiUrl) {
    const lokiTransport = pino.transport<LokiOptions>({
      target: "pino-loki",
      options: {
        host: lokiUrl,
        labels: { app },
        replaceTimestamp: true,
        propsToLabels: ["level"],
      },
    });

    return pino(
      options,
      pino.multistream([{ stream: process.stdout }, { stream: lokiTransport }]),
    );
  }

  return pino(options, process.stdout);
}
