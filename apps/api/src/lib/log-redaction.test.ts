import { Writable } from 'node:stream';
import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import { LOG_REDACT } from './log-redaction.js';

// The real Fastify/pino pipeline (serializer, then redaction) with a capturing
// stream, not a reimplementation — the property under test is what reaches
// the log line.
function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const app = Fastify({
    logger: { level: 'info', stream, redact: LOG_REDACT },
  });
  return { log: app.log, lines };
}

// The shape ioredis gives a reply/abort error (`err.command = { name, args }`).
function redisError(args: unknown[]) {
  return Object.assign(new Error('Command aborted due to connection close'), {
    command: { name: 'evalsha', args },
  });
}

const JOB_JSON = JSON.stringify({
  email: 'rider@example.test',
  verifyUrl: 'https://coffeeride.site/verify-email?token=one-time-token',
});

describe('LOG_REDACT (CR-251)', () => {
  it('drops a Redis command’s args from a logged error, keeps its name', () => {
    const { log, lines } = captureLogger();
    log.error({ err: redisError(['sha', 'key', JOB_JSON]) }, 'enqueue failed');

    expect(lines).toHaveLength(1);
    expect(lines[0]).not.toContain('rider@example.test');
    expect(lines[0]).not.toContain('one-time-token');
    const entry = JSON.parse(lines[0]!);
    expect(entry.err.command).toEqual({ name: 'evalsha', args: '[redacted]' });
    expect(entry.err.message).toBe('Command aborted due to connection close');
  });

  it('covers an error held in a property and an AggregateError’s members', () => {
    const { log, lines } = captureLogger();
    const wrapped = Object.assign(new Error('enqueue failed'), {
      inner: redisError([JOB_JSON]),
    });
    log.error({ err: wrapped }, 'nested');
    log.error(
      { err: new AggregateError([redisError([JOB_JSON])], 'several') },
      'aggregate',
    );

    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(line).not.toContain('rider@example.test');
      expect(line).not.toContain('one-time-token');
    }
  });

  it('leaves an ordinary error untouched', () => {
    const { log, lines } = captureLogger();
    log.error({ err: new Error('plain failure') }, 'plain');
    const entry = JSON.parse(lines[0]!);
    expect(entry.err.message).toBe('plain failure');
    expect(entry.err).not.toHaveProperty('command');
  });
});
