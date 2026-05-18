import type { ExtractionResult, Formatter } from '../core/types.js';

export class JSONFormatter implements Formatter {
  id = 'json';

  format(result: ExtractionResult): string {
    const output = {
      version: '1.0',
      extracted_at: new Date().toISOString(),
      source: {
        platform: result.source.platform,
        channel: result.source.channel,
      },
      signals: result,
    };

    return JSON.stringify(output, null, 2);
  }
}
