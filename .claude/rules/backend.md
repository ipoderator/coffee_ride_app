# Backend Rules

Fastify + TypeScript + REST/OpenAPI.

The API owns:
- authentication;
- authorization;
- ride lifecycle;
- registration/capacity;
- organizer ownership;
- routes/stops/services;
- notifications;
- persistence orchestration.

Validate all external input at runtime with Zod.

Use transactions for atomic business operations.

Registration must atomically:
- verify the ride accepts registrations;
- verify capacity;
- prevent duplicate active registration;
- create/update waitlist state when applicable.

Use consistent errors.
Never leak stack traces or database internals.
