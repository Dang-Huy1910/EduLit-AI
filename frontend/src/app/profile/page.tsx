'use client';

import { isApiMode } from '@/lib/data-mode';
import UnimplementedPanel from '@/components/UnimplementedPanel';
import ApiStudentProfileView from '@/features/writing-profile/ApiStudentProfileView';

export default function ProfilePage() {
  return isApiMode() ? <ApiStudentProfileView /> : <UnimplementedPanel shell="student" title="Hồ sơ văn phong" description="Mở API mode để xem hồ sơ từ các bài đã công bố." />;
}
