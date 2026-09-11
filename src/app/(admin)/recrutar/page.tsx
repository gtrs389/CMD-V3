import type { Metadata } from 'next';
import { RecruitView } from '@/components/recruit/RecruitView';

export const metadata: Metadata = {
  title: 'Recrutar',
};

export default function RecruitPage() {
  return <RecruitView />;
}
