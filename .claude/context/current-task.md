# Current task — CR-270 — Legal texts: data in Russia, no cross-border transfer

Source: owner, 2026-10-15 — answers to CR-269's open inputs: hosting provider Russian,
server in the Netherlands → being moved to Russia («напиши что находится в России»);
«ничего мы не передаём» → drop the cross-border wording; a sample of another
organizer's ride rules/consent/waiver to borrow from. Branch `fix/legal-texts-russia`.

## Acceptance criteria

- privacy §8 says the data is stored and processed in Russia — done;
- no cross-border statement in privacy/consent, and the code matches: `siteverify` gets
  the token only (ADR-042) — done;
- terms take the sample's safety rules without a blanket waiver of claims — done;
- the hash test, api reCAPTCHA tests and Storybook pass — done.

## Validation

web unit 166/166; api auth+legal 239; Storybook 27/27; typecheck 8/8; lint 9/9.

## Final result

Merged (PR #74, `5c04b36`) and deployed to production 2026-10-15 (owner). The owner is moving the server to Russia (KI-105); operator details and
the lawyer's review still pending.
