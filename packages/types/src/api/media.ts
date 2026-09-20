// CR-097 (KI-023 remainder): shared response shape for the two "me"-scoped avatar
// mutation endpoints (`POST`/`PATCH /v1/users/me/avatar`,
// `POST`/`PATCH /v1/organizers/me/avatar`) — a distinct file rather than adding it
// to either `users.ts`/`organizers.ts` since both capability modules use it, same
// "return just the sub-resource" shape as `rides.ts`' `CoverImageResponse` (which
// stays there, keyed to `Ride` only, since its field name differs).
export interface AvatarResponse {
  avatarUrl: string;
}
