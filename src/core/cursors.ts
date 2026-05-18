/**
 * CursorStore — Collector cursor persistence
 * Stores continuation tokens for incremental collection
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse, stringify } from 'yaml';

export class CursorStore {
  private cursors: Map<string, string>; // collectorId → cursor value
  private dirty: boolean = false;

  constructor(private cursorPath: string) {
    this.cursors = new Map();
  }

  /**
   * Load cursors from YAML file (key: value pairs)
   */
  load(): void {
    if (!existsSync(this.cursorPath)) {
      return;
    }

    try {
      const content = readFileSync(this.cursorPath, 'utf-8');
      const data = parse(content) as Record<string, string> | null;

      if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'string') {
            this.cursors.set(key, value);
          }
        }
      }
    } catch {
      // Skip malformed or empty YAML files
    }
  }

  /**
   * Get cursor for a collector
   */
  get(collectorId: string): string | undefined {
    return this.cursors.get(collectorId);
  }

  /**
   * Set cursor in memory only, mark dirty
   */
  set(collectorId: string, cursor: string): void {
    this.cursors.set(collectorId, cursor);
    this.dirty = true;
  }

  /**
   * Write all cursors to YAML file (only if dirty)
   * Only called by pipeline when failedBlocks === 0
   */
  commit(): void {
    if (!this.dirty) {
      return;
    }

    const data: Record<string, string> = {};
    for (const [key, value] of this.cursors.entries()) {
      data[key] = value;
    }

    const yaml = stringify(data);
    writeFileSync(this.cursorPath, yaml, 'utf-8');
    this.dirty = false;
  }
}
