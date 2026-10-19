'use client';

import React from 'react';
import CompetencyReportView from '@/features/assessment/CompetencyReportView';

export default function ReportsPage() {
  return (
    <React.Suspense fallback={<div className="p-8 text-sm text-on-surface-variant">Đang tải báo cáo...</div>}>
      <CompetencyReportView />
    </React.Suspense>
  );
}
