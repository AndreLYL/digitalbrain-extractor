// tests/collectors/agent/collector.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { AgentSessionCollector } from '../../../src/collectors/agent/collector';
import type { SessionParser, SessionLayout, SessionMeta, SessionParseContext } from '../../../src/collectors/agent/types';
import type { RawMessage } from '../../../src/core/types';

// Minimal test parser
class TestParser implements SessionParser {
  readonly platformId = 'test-platform';

  parseSessionMeta(line: Record<string, unknown>): SessionMeta | null {
    if (line.type === 'meta') {
      return {
        sessionId: line.id as string,
        timestamp: line.ts as string,
        cwd: line.cwd as string | undefined,
      };
    }
    return null;
  }

  isConversationRecord(line: Record<string, unknown>): boolean {
    return line.type === 'msg';
  }

  parseRecord(line: Record<string, unknown>, context: SessionParseContext): RawMessage | null {
    return {
      platform: this.platformId,
      channel: context.channel,
      contact: line.role as string,
      timestamp: line.ts as string,
      content: line.text as string,
      direction: line.role === 'user' ? 'sent' : 'received',
      metadata: {
        session_id: context.sessionId,
        cursor: context.sessionId,
      },
    };
  }
}

function testLayout(baseDir: string): SessionLayout {
  return {
    baseDir,
    glob: '*.jsonl',
    sessionIdFromPath: (filePath: string) => path.basename(filePath, '.jsonl'),
    channelFromPath: (_filePath: string, sessionId: string) => sessionId,
  };
}

describe('AgentSessionCollector', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'collector-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should have correct id and name from parser', () => {
    const collector = new AgentSessionCollector(testLayout(tempDir), new TestParser());
    expect(collector.id).toBe('test-platform');
  });

  it('should pass healthCheck when baseDir exists', async () => {
    const collector = new AgentSessionCollector(testLayout(tempDir), new TestParser());
    const result = await collector.healthCheck();
    expect(result.ok).toBe(true);
  });

  it('should fail healthCheck when baseDir does not exist', async () => {
    const collector = new AgentSessionCollector(testLayout('/nonexistent'), new TestParser());
    const result = await collector.healthCheck();
    expect(result.ok).toBe(false);
  });

  it('should parse JSONL and yield RawMessages', async () => {
    const content = [
      '{"type":"meta","id":"s1","ts":"2024-01-01T10:00:00Z","cwd":"/test"}',
      '{"type":"msg","role":"user","ts":"2024-01-01T10:00:01Z","text":"hello"}',
      '{"type":"msg","role":"assistant","ts":"2024-01-01T10:00:02Z","text":"hi there"}',
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'session-1.jsonl'), content);

    const collector = new AgentSessionCollector(testLayout(tempDir), new TestParser());
    const messages: RawMessage[] = [];
    for await (const msg of collector.fetch({})) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(2);
    expect(messages[0].contact).toBe('user');
    expect(messages[0].content).toBe('hello');
    expect(messages[1].contact).toBe('assistant');
    expect(messages[1].content).toBe('hi there');
  });

  it('should inject line_index and file_path into metadata', async () => {
    const content = [
      '{"type":"msg","role":"user","ts":"2024-01-01T10:00:00Z","text":"test"}',
    ].join('\n');
    const filePath = path.join(tempDir, 'test.jsonl');
    await fs.writeFile(filePath, content);

    const collector = new AgentSessionCollector(testLayout(tempDir), new TestParser());
    const messages: RawMessage[] = [];
    for await (const msg of collector.fetch({})) {
      messages.push(msg);
    }

    expect(messages[0].metadata?.line_index).toBe(0);
    expect(messages[0].metadata?.file_path).toBe(filePath);
  });

  it('should skip malformed JSON lines gracefully', async () => {
    const content = [
      '{"type":"msg","role":"user","ts":"2024-01-01T10:00:00Z","text":"ok"}',
      'NOT VALID JSON',
      '{"type":"msg","role":"user","ts":"2024-01-01T10:00:01Z","text":"also ok"}',
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'test.jsonl'), content);

    const collector = new AgentSessionCollector(testLayout(tempDir), new TestParser());
    const messages: RawMessage[] = [];
    for await (const msg of collector.fetch({})) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(2);
  });

  it('should not process same sessionId twice in one run', async () => {
    const content = '{"type":"meta","id":"same-session","ts":"2024-01-01T10:00:00Z"}\n{"type":"msg","role":"user","ts":"2024-01-01T10:00:01Z","text":"msg"}';
    await fs.writeFile(path.join(tempDir, 'file-a.jsonl'), content);
    await fs.writeFile(path.join(tempDir, 'file-b.jsonl'), content);

    const collector = new AgentSessionCollector(testLayout(tempDir), new TestParser());
    const messages: RawMessage[] = [];
    for await (const msg of collector.fetch({})) {
      messages.push(msg);
    }

    expect(messages).toHaveLength(1);
  });

  it('should pass sessionMeta to parseRecord via context', async () => {
    const capturedContexts: SessionParseContext[] = [];
    class CapturingParser extends TestParser {
      parseRecord(line: Record<string, unknown>, context: SessionParseContext): RawMessage | null {
        capturedContexts.push({ ...context });
        return super.parseRecord(line, context);
      }
    }

    const content = [
      '{"type":"meta","id":"s1","ts":"2024-01-01T10:00:00Z","cwd":"/project"}',
      '{"type":"msg","role":"user","ts":"2024-01-01T10:00:01Z","text":"test"}',
    ].join('\n');
    await fs.writeFile(path.join(tempDir, 'session.jsonl'), content);

    const collector = new AgentSessionCollector(testLayout(tempDir), new CapturingParser());
    for await (const _ of collector.fetch({})) { /* drain */ }

    expect(capturedContexts).toHaveLength(1);
    expect(capturedContexts[0].sessionMeta).toEqual({
      sessionId: 's1',
      timestamp: '2024-01-01T10:00:00Z',
      cwd: '/project',
    });
    expect(capturedContexts[0].lineIndex).toBe(1);
  });

  it('should yield empty when no files exist', async () => {
    const collector = new AgentSessionCollector(testLayout(tempDir), new TestParser());
    const messages: RawMessage[] = [];
    for await (const msg of collector.fetch({})) {
      messages.push(msg);
    }
    expect(messages).toHaveLength(0);
  });
});
