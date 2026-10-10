import type { AdminOverview, GetAdminOverviewResponse } from 'types';
import { adminRequest } from '@/lib/admin/client';

/** CR-231: the platform counters and dependency states for «Обзор». */
export async function getAdminOverview(): Promise<AdminOverview> {
  const body = await adminRequest<GetAdminOverviewResponse>('/overview');
  return body.overview;
}
