import type { Metadata } from 'next';
import { requireAdminPage } from '@/lib/auth/server';
import { RecruitView } from '@/components/recruit/RecruitView';

export const metadata: Metadata = {
  title: 'Recrutar',
};

export default async function RecruitPage() {
  await requireAdminPage();
  return <RecruitView />;
}
