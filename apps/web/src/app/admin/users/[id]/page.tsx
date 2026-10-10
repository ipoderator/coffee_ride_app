import { notFound } from 'next/navigation';
import { AdminUserCard } from '@/features/admin/users/components/AdminUserCard';
import { usersBackHref } from '@/features/admin/users/filters';
import { isUuid } from '@/lib/uuid';

// CR-232: `?from=` carries the users list's filters, so «К пользователям»
// returns to the same search; `usersBackHref` re-parses it, so the link can
// only ever be the users list.
export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, { from }] = await Promise.all([params, searchParams]);
  // The API answers a malformed id with 400, which the card would show as a
  // retryable load error; no user can live there — and the id never reaches
  // a request path unchecked.
  if (!isUuid(id)) notFound();
  return (
    <AdminUserCard
      key={id}
      userId={id}
      backHref={usersBackHref(typeof from === 'string' ? from : undefined)}
    />
  );
}
