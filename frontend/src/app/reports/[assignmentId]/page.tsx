'use client';
import { isApiMode } from '@/lib/data-mode';
import ApiTeacherPipelineView from '@/features/assessment/ApiTeacherPipelineView';
import UnimplementedPanel from '@/components/UnimplementedPanel';
export default function AssignmentPipelineReportPage() { return isApiMode() ? <ApiTeacherPipelineView/> : <UnimplementedPanel shell="teacher" title="Báo cáo theo đề" description="Mở trong API mode để duyệt luồng bài nộp."/>; }
