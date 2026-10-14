// CR-251. ioredis attaches `command: { name, args }` to every reply error and to
// the "Command aborted due to connection close" error (`DataHandler.returnError`,
// `event_handler.abortError`), and pino's `err` serializer copies that object
// into the log line. The args are whatever the command carried: a BullMQ
// `queue.add()` passes the job's JSON — a recipient email plus a one-time
// verify/reset link — so a Redis hiccup during an enqueue logged both
// (`.claude/rules/security.md`: never log tokens or private contact data).
// The command name stays (it is what tells the failure apart); its arguments
// never reach a log line. One app-wide rule rather than a scrub at each
// `logger.*({ err })` call site, so a new Redis caller can't forget it.
//
// Paths cover the shapes pino's serializer produces: the error itself, an
// error held in one of its properties (serialized the same way), and the
// members of an `AggregateError`. Every log call in `apps/api` passes its
// error under `err`.
export const LOG_REDACT = {
  paths: [
    'err.command.args',
    'err.*.command.args',
    'err.aggregateErrors[*].command.args',
  ],
  censor: '[redacted]',
};
