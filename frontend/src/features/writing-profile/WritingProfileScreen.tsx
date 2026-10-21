'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import StudentShell from '@/components/StudentShell';
import TeacherShell from '@/components/TeacherShell';
import { useAppStore } from '@/lib/store';
import { useAuthStore } from '@/lib/auth-store';
import { AuthApiError } from '@/lib/auth-types';
import { writingProfileApi } from '@/features/writing-profile/api';
import { useTeacherClassContext } from '@/features/classrooms/useClassContext';
import {
  AI_LABEL,
  DEFAULT_FILTERS,
  LEVEL_STEPS,
  PUBLISHED_LABEL,
  createRequestGuard,
  filterObservations,
  formatDate,
  initialsOf,
  profileStats,
  profileView,
  resultHref,
  type GenreFilter,
  type KindFilter,
  type ObservationFilters,
} from '@/features/writing-profile/model';
import type {
  ObservationKind,
  WritingProfileResponse,
} from '@/features/writing-profile/types';
import WritingProfileProgress from '@/features/writing-profile/WritingProfileProgress';

const KIND_STYLE: Record<ObservationKind, { bg: string; icon: string; label: string }> = {
  STRENGTH: {
    bg: 'bg-blue-50 text-blue-800 border-blue-200/80',
    icon: 'verified',
    label: 'Điểm mạnh',
  },
  WEAKNESS: {
    bg: 'bg-amber-50 text-amber-900 border-amber-200/80',
    icon: 'trending_up',
    label: 'Điểm cần rèn',
  },
  STYLE: {
    bg: 'bg-purple-50 text-purple-800 border-purple-200/80',
    icon: 'palette',
    label: 'Đặc trưng diễn đạt',
  },
};

const GENRE_OPTIONS: { value: GenreFilter; label: string }[] = [
  { value: 'ALL', label: 'Tất cả thể loại' },
  { value: 'NLVH', label: 'Nghị luận Văn học' },
  { value: 'NLXH', label: 'Nghị luận Xã hội' },
];

const KIND_OPTIONS: { value: Exclude<KindFilter, 'ALL'>; label: string; active: string }[] = [
  { value: 'STRENGTH', label: 'Điểm mạnh', active: 'bg-blue-50 text-blue-700' },
  { value: 'STYLE', label: 'Đặc trưng diễn đạt', active: 'bg-purple-50 text-purple-700' },
  { value: 'WEAKNESS', label: 'Cần rèn luyện', active: 'bg-amber-50 text-amber-800' },
];

const PIPELINE_STEPS = [
  {
    text: 'text-secondary',
    dot: 'bg-secondary',
    title: 'Bài viết đã công bố',
    body: 'Chỉ lấy tối đa 5 bài gần nhất có kết quả đang được giáo viên công bố, cùng đúng bản chép đã được chấm. Bản nháp hay bản nộp mới chưa công bố không được dùng.',
  },
  {
    text: 'text-primary',
    dot: 'bg-primary',
    title: 'AI tổng hợp một lần',
    body: 'Khi em bấm “Cập nhật hồ sơ”, AI đọc các bài và nhận xét đã công bố để nhận xét cách dùng từ, diễn đạt và lập luận theo 8 nhóm, kèm câu trích nguyên văn.',
  },
  {
    text: 'text-tertiary',
    dot: 'bg-tertiary',
    title: 'Kiểm tra minh chứng',
    body: 'Hệ thống chỉ giữ nhận xét có câu trích nằm đúng trong trang bài viết được dẫn. Tên bài, thể loại và ngày công bố lấy từ hệ thống, không do AI tự đặt.',
  },
  {
    text: 'text-secondary',
    dot: 'bg-secondary',
    title: 'Em tự luyện tập',
    body: 'Mỗi nhận xét có gợi ý luyện tập ngắn. Em mở lại bài để đối chiếu, áp dụng ở bài sau và cập nhật hồ sơ khi có kết quả mới được công bố.',
  },
] as const;

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof AuthApiError) return err.message;
  return fallback;
}

export type WritingProfileScreenProps =
  | { mode: 'student' }
  | { mode: 'teacher'; classroomId: string; studentId: string };

/**
 * The writing profile, for the student themselves or read-only for a teacher.
 * Only the student can refresh it or open their result pages.
 */
export default function WritingProfileScreen(props: WritingProfileScreenProps) {
  const isTeacher = props.mode === 'teacher';
  const classroomId = isTeacher ? props.classroomId : '';
  const studentId = isTeacher ? props.studentId : '';
  const { addToast } = useAppStore();
  const authUserId = useAuthStore((s) => s.user?.id ?? null);
  // Responses are keyed to whose profile is on screen.
  const userId = isTeacher ? (authUserId ? `${authUserId}:${classroomId}:${studentId}` : null) : authUserId;
  // Only the student's own view needs their class context (for the school year).
  const { term } = useTeacherClassContext({ role: isTeacher ? 'teacher' : 'student' });

  const [data, setData] = useState<WritingProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [filters, setFilters] = useState<ObservationFilters>(DEFAULT_FILTERS);
  const [expandedPipeline, setExpandedPipeline] = useState(false);

  // Bumped on every account change; responses from an older generation are dropped.
  const guardRef = useRef(createRequestGuard());

  const load = useCallback(async () => {
    const generation = guardRef.current.current();
    setLoading(true);
    setLoadError('');
    try {
      const payload = isTeacher
        ? await writingProfileApi.getForTeacher(classroomId, studentId)
        : await writingProfileApi.get();
      if (!guardRef.current.isCurrent(generation)) return;
      setData(payload);
    } catch (err) {
      if (!guardRef.current.isCurrent(generation)) return;
      setData(null);
      setLoadError(errorMessage(err, 'Không tải được hồ sơ văn phong. Em thử lại nhé.'));
    } finally {
      if (guardRef.current.isCurrent(generation)) setLoading(false);
    }
  }, [isTeacher, classroomId, studentId]);

  useEffect(() => {
    guardRef.current.bump();
    setData(null);
    setRefreshing(false);
    setRefreshError('');
    setFilters(DEFAULT_FILTERS);
    if (!userId) {
      setLoading(true);
      return;
    }
    void load();
  }, [userId, load]);

  const handleRefresh = async () => {
    if (refreshing || isTeacher) return;
    const generation = guardRef.current.current();
    setRefreshing(true);
    setRefreshError('');
    try {
      const payload = await writingProfileApi.refresh();
      if (!guardRef.current.isCurrent(generation)) return;
      setData(payload);
      setFilters(DEFAULT_FILTERS);
      if (payload.status === 'ready') {
        addToast(
          payload.refreshed
            ? 'Đã cập nhật hồ sơ văn phong từ các bài đã công bố.'
            : 'Các bài đã công bố chưa thay đổi, hồ sơ đang là bản mới nhất.',
          payload.refreshed ? 'success' : 'info'
        );
      }
    } catch (err) {
      if (!guardRef.current.isCurrent(generation)) return;
      setRefreshError(
        errorMessage(err, 'Chưa cập nhật được hồ sơ. Hồ sơ không bị thay đổi, em bấm Thử lại nhé.')
      );
    } finally {
      if (guardRef.current.isCurrent(generation)) setRefreshing(false);
    }
  };

  const view = profileView({ loading, error: loadError, data });
  // With new papers waiting, the previous profile stays visible under the notice.
  const profile = view === 'ready' || view === 'insufficient' || view === 'stale' ? data?.profile ?? null : null;
  const observations = useMemo(() => profile?.observations ?? [], [profile]);
  const filteredObservations = useMemo(
    () => filterObservations(observations, filters),
    [observations, filters]
  );
  const stats = useMemo(() => profileStats(data), [data]);
  const latestSource = profile?.sources.find((source) => source.linkable !== false) ?? null;

  const setFilter = <K extends keyof ObservationFilters>(key: K, value: ObservationFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));

  const handleResetFilters = () => {
    setFilters(DEFAULT_FILTERS);
    addToast('Đã khôi phục bộ lọc hồ sơ văn phong!', 'info');
  };

  const student = data?.student;
  const className = student?.className || (student?.classCode ? `Lớp ${student.classCode}` : '');
  const academicYear = student?.academicYear || term?.academicYear || '';
  const updatedOn = formatDate(data?.updatedAt);

  const refreshButton = (label = 'Cập nhật hồ sơ') => isTeacher ? null : (
    <button
      type="button"
      onClick={() => void handleRefresh()}
      disabled={refreshing || loading || !data || data.status === 'empty'}
      className="px-3.5 py-1.5 bg-gradient-to-r from-secondary to-primary text-white rounded-xl text-xs font-semibold hover:brightness-105 active:scale-95 transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
    >
      <span className={`material-symbols-outlined text-sm ${refreshing ? 'animate-spin' : ''}`}>
        {refreshing ? 'progress_activity' : 'auto_awesome'}
      </span>
      <span>{refreshing ? 'Đang phân tích...' : label}</span>
    </button>
  );

  const content = (
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        {/* Top bar */}
        <div className="glass-panel p-3.5 sm:p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-lg">fingerprint</span>
            </div>
            <div>
              <span className="text-xs font-bold text-on-surface">
                {isTeacher
                  ? `Hồ sơ văn phong của ${data?.student.displayName || 'học sinh'}`
                  : 'Hồ sơ Chân dung Cây bút của em'}
              </span>
              <p className="text-[11px] text-on-surface-variant">
                {isTeacher
                  ? 'Chỉ xem • AI tổng hợp từ các bài em đã được công bố kết quả'
                  : `AI tổng hợp từ các bài đã được công bố kết quả • ${term?.name || 'Kỳ học đang chọn'}, năm học ${academicYear.replace('-', '–')}`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {isTeacher && (
              <Link
                href={`/classrooms/${encodeURIComponent(classroomId)}`}
                className="p-1.5 px-2.5 rounded-xl border border-outline-variant/40 hover:bg-surface-container/60 text-on-surface-variant text-xs flex items-center gap-1 transition-all"
              >
                <span className="material-symbols-outlined text-base">arrow_back</span>
                <span>Về lớp</span>
              </Link>
            )}
            {profile && (
              <button
                type="button"
                onClick={handleResetFilters}
                title="Khôi phục bộ lọc"
                className="p-1.5 px-2.5 rounded-xl border border-outline-variant/40 hover:bg-surface-container/60 text-on-surface-variant text-xs flex items-center gap-1 transition-all active:scale-95"
              >
                <span className="material-symbols-outlined text-base">restart_alt</span>
                <span className="hidden sm:inline">Khôi phục lọc</span>
              </button>
            )}
            {refreshButton()}
          </div>
        </div>

        {refreshError && (
          <div
            role="alert"
            className="glass-panel p-3.5 rounded-2xl border border-error/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
          >
            <div className="flex items-start gap-2 text-xs text-error">
              <span className="material-symbols-outlined text-base shrink-0">error</span>
              <p className="leading-relaxed">{refreshError}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleRefresh()}
              disabled={refreshing}
              className="self-end sm:self-auto px-3 py-1.5 rounded-xl border border-error/40 text-error text-xs font-semibold hover:bg-error/5 transition-all disabled:opacity-60"
            >
              Thử lại
            </button>
          </div>
        )}

        {view === 'loading' ? (
          <ProfileSkeleton />
        ) : view === 'error' || !data ? (
          <StateCard
            icon="cloud_off"
            title="Không tải được hồ sơ văn phong"
            body={loadError || 'Không tải được hồ sơ văn phong. Em thử lại nhé.'}
            action={
              <button
                type="button"
                onClick={() => void load()}
                className="px-4 py-1.5 bg-secondary text-white text-xs font-semibold rounded-xl hover:bg-secondary/90 transition-all shadow-sm"
              >
                Thử lại
              </button>
            }
          />
        ) : (
          <>
            {/* Hero: student header */}
            <div className="glass-panel relative overflow-hidden rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="absolute -top-16 -right-16 w-72 h-72 bg-secondary/8 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-0 right-1/4 w-56 h-56 bg-primary/8 rounded-full blur-2xl pointer-events-none" />

              <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-start sm:items-center gap-4 sm:gap-5">
                  <div className="relative shrink-0">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-secondary-container via-primary-container to-secondary text-on-secondary-container flex items-center justify-center font-bold text-2xl shadow-md border-2 border-surface-container-lowest">
                      {initialsOf(data.student.displayName)}
                    </div>
                    <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center shadow-sm">
                      <span className="material-symbols-outlined text-xs">auto_awesome</span>
                    </div>
                  </div>

                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-xl sm:text-2xl font-bold font-merriweather text-on-surface">
                        {data.student.displayName}
                      </h1>
                      {data.student.loginId && (
                        <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant border border-outline-variant/40">
                          {data.student.loginId}
                        </span>
                      )}
                      {className && (
                        <span className="text-xs text-on-surface-variant font-medium">{className}</span>
                      )}
                    </div>

                    {profile ? (
                      <>
                        <div className="inline-flex flex-wrap items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-900 font-bold text-xs sm:text-sm">
                          <span className="material-symbols-outlined text-amber-600 text-base">psychology</span>
                          <span>{AI_LABEL}</span>
                          {updatedOn && (
                            <span className="font-medium text-amber-800/80">• cập nhật {updatedOn}</span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed max-w-2xl pt-1">
                          {profile.insufficient || !profile.summary
                            ? profile.notice || 'Chưa đủ căn cứ trích dẫn để tổng hợp hồ sơ.'
                            : profile.summary}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed max-w-2xl pt-1">
                        {data.status === 'empty'
                          ? 'Hồ sơ văn phong sẽ được tổng hợp khi em có bài viết được công bố kết quả.'
                          : `Có ${data.sourceSummary.eligibleCount} bài đã công bố sẵn sàng để phân tích.`}
                      </p>
                    )}
                  </div>
                </div>

                {/* KPI metrics */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 lg:w-96 shrink-0">
                  <Kpi value={stats.analyzedCount} label="Bài được phân tích" tone="text-on-surface" />
                  <Kpi value={stats.strengthCount} label="Điểm mạnh" tone="text-blue-600" labelTone="text-blue-700" />
                  <Kpi value={stats.weaknessCount} label="Điểm cần rèn" tone="text-amber-600" labelTone="text-amber-700" />
                  <Kpi value={stats.styleCount} label="Đặc trưng diễn đạt" tone="text-purple-600" labelTone="text-purple-700" />
                </div>
              </div>
            </div>

            {/* How the profile is built */}
            <div className="glass-panel rounded-2xl shadow-xs overflow-hidden">
              <button
                type="button"
                onClick={() => setExpandedPipeline(!expandedPipeline)}
                aria-expanded={expandedPipeline}
                className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-surface-container-low/40 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">hub</span>
                  </div>
                  <div>
                    <span className="text-xs font-bold text-on-surface">
                      Hồ sơ văn phong được tổng hợp như thế nào?
                    </span>
                    <span className="text-[11px] text-on-surface-variant ml-2 hidden sm:inline">
                      (Bài đã công bố &rarr; AI tổng hợp &rarr; Kiểm tra minh chứng &rarr; Em luyện tập)
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-xs text-on-surface-variant font-medium shrink-0">
                  <span className="hidden sm:inline">{expandedPipeline ? 'Thu gọn' : 'Xem quy trình'}</span>
                  <span className="material-symbols-outlined text-sm">
                    {expandedPipeline ? 'expand_less' : 'expand_more'}
                  </span>
                </div>
              </button>

              {expandedPipeline && (
                <div className="p-5 border-t border-outline-variant/20 bg-surface/30 space-y-4 text-xs">
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {PIPELINE_STEPS.map((step, index) => (
                      <div key={step.title} className="p-3.5 glass-card rounded-xl space-y-1.5">
                        <div className={`flex items-center gap-2 font-bold ${step.text}`}>
                          <span
                            className={`w-5 h-5 rounded-full ${step.dot} text-white text-[10px] flex items-center justify-center`}
                          >
                            {index + 1}
                          </span>
                          <span>{step.title}</span>
                        </div>
                        <p className="text-[11px] text-on-surface-variant leading-relaxed">{step.body}</p>
                      </div>
                    ))}
                  </div>

                  <div className="p-3 rounded-xl glass-card border border-secondary/20 flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary text-xl shrink-0">shield_with_heart</span>
                    <p className="text-[11px] text-on-surface-variant leading-relaxed">
                      <strong>Nguyên tắc:</strong> Hồ sơ chỉ nhận xét đặc điểm bài viết, không suy đoán tính cách và
                      không ảnh hưởng điểm số. Nội dung hồ sơ là <strong>{AI_LABEL}</strong>; nhận xét trong từng bài
                      vẫn là <strong>{PUBLISHED_LABEL}</strong> như trên trang kết quả.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {view === 'empty' && (
              <StateCard
                icon="draft"
                title="Chưa có bài viết được công bố"
                body={data.notice || 'Em chưa có bài viết nào được công bố kết quả.'}
                action={
                  <Link
                    href="/assignments"
                    className="px-4 py-1.5 bg-secondary text-white text-xs font-semibold rounded-xl hover:bg-secondary/90 transition-all shadow-sm"
                  >
                    Xem bài tập của em
                  </Link>
                }
              />
            )}

            {view === 'not_analyzed' && (
              <StateCard
                icon="auto_awesome"
                title="Hồ sơ đang được tổng hợp lần đầu"
                body={
                  isTeacher
                    ? 'Hồ sơ văn phong của em đang được hệ thống tổng hợp lần đầu từ các bài đã công bố. Thầy cô quay lại sau ít phút nhé.'
                    : data.notice || 'Em bấm “Cập nhật hồ sơ” để hệ thống phân tích các bài đã công bố.'
                }
                hint={
                  isTeacher
                    ? `Em đang có ${data.sourceSummary.eligibleCount} bài đã công bố.`
                    : `Có ${data.sourceSummary.eligibleCount} bài đã công bố. Mỗi lần cập nhật, hệ thống đọc tối đa 5 bài mới nhất; việc phân tích có thể mất khoảng một phút.`
                }
                action={refreshButton()}
              />
            )}

            {view === 'stale' && (
              // A slim notice: the previous profile stays right below it.
              <div className="px-4 py-2.5 rounded-xl border border-amber-500/25 bg-amber-500/5">
                <p className="flex items-center gap-2 text-xs text-on-surface">
                  <span className="material-symbols-outlined text-base text-amber-600 shrink-0" aria-hidden="true">update</span>
                  <span>
                    {isTeacher
                      ? `Em có ${data.sourceSummary.pendingCount ?? 0} bài mới chưa được đưa vào hồ sơ.`
                      : `Có ${data.sourceSummary.pendingCount ?? 0} bài mới chưa đưa vào hồ sơ. Em bấm “Cập nhật hồ sơ” ở trên để thêm vào.`}
                  </span>
                </p>
              </div>
            )}

            {profile && (
              <>
                {/* Eight expression groups */}
                <div className="glass-panel p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-sm sm:text-base font-bold font-merriweather text-on-surface">
                        8 Nhóm Năng Lực Diễn Đạt
                      </h2>
                      <p className="text-xs text-on-surface-variant">
                        Bấm vào từng nhóm để lọc các minh chứng tương ứng bên dưới
                      </p>
                    </div>

                    {filters.traitId !== 'ALL' && (
                      <button
                        type="button"
                        onClick={() => setFilter('traitId', 'ALL')}
                        className="text-xs text-secondary hover:underline font-semibold flex items-center gap-1 self-start sm:self-auto"
                      >
                        <span>Xem tất cả 8 nhóm</span>
                        <span className="material-symbols-outlined text-sm">close</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {profile.traits.map((trait) => {
                      const isSelected = filters.traitId === trait.traitId;
                      const steps = LEVEL_STEPS[trait.level] ?? 0;
                      const empty = trait.evidenceCount === 0;
                      return (
                        <button
                          key={trait.traitId}
                          type="button"
                          aria-pressed={isSelected}
                          onClick={() => setFilter('traitId', isSelected ? 'ALL' : trait.traitId)}
                          className={`text-left p-3.5 rounded-xl border transition-all ${
                            isSelected
                              ? 'border-secondary bg-secondary-fixed/30 shadow-xs ring-1 ring-secondary'
                              : 'border-outline-variant/30 glass-card hover:bg-surface-container-low/80'
                          }`}
                        >
                          <p className="text-xs font-bold text-on-surface mb-2">{trait.traitName}</p>

                          {/* Level meter: three recognition steps, not a score */}
                          <div className="grid grid-cols-3 gap-1 mb-2" aria-hidden="true">
                            {[1, 2, 3].map((step) => (
                              <div
                                key={step}
                                className={`h-1.5 rounded-full ${
                                  step <= steps
                                    ? 'bg-gradient-to-r from-secondary to-primary'
                                    : 'bg-surface-container'
                                }`}
                              />
                            ))}
                          </div>

                          <div className="flex items-center justify-between gap-2 text-[11px] mb-1">
                            <span className={`font-semibold ${empty ? 'text-outline' : 'text-secondary'}`}>
                              {empty ? 'Chưa đủ dữ liệu' : trait.levelLabel}
                            </span>
                            <span className={`font-semibold shrink-0 ${empty ? 'text-outline' : 'text-secondary'}`}>
                              {trait.evidenceCount} minh chứng
                            </span>
                          </div>
                          <p className="text-[11px] text-on-surface-variant leading-relaxed line-clamp-2">
                            {empty ? 'Chưa có câu trích đủ căn cứ cho nhóm này.' : trait.note}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <WritingProfileProgress history={data.history ?? []} traits={profile.traits} />

                {/* Observations with filters */}
                <div className="space-y-4">
                  {view === 'ready' && (
                    <div className="glass-panel p-4 rounded-2xl shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="flex flex-wrap items-center bg-surface-container-low/70 p-1 rounded-xl border border-outline-variant/30 text-xs">
                          {GENRE_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={filters.genre === option.value}
                              onClick={() => setFilter('genre', option.value)}
                              className={`px-3 py-1 rounded-lg font-medium transition-all ${
                                filters.genre === option.value
                                  ? 'bg-surface-container-lowest text-primary font-bold shadow-xs'
                                  : 'text-on-surface-variant hover:text-on-surface'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>

                        <div className="flex flex-wrap items-center bg-surface-container-low p-1 rounded-xl border border-outline-variant/30 text-xs">
                          <button
                            type="button"
                            aria-pressed={filters.kind === 'ALL'}
                            onClick={() => setFilter('kind', 'ALL')}
                            className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                              filters.kind === 'ALL'
                                ? 'bg-surface-container-lowest text-on-surface font-bold shadow-sm'
                                : 'text-on-surface-variant hover:text-on-surface'
                            }`}
                          >
                            Tất cả ({observations.length})
                          </button>
                          {KIND_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              aria-pressed={filters.kind === option.value}
                              onClick={() => setFilter('kind', option.value)}
                              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                                filters.kind === option.value
                                  ? `${option.active} font-bold shadow-sm`
                                  : 'text-on-surface-variant hover:text-on-surface'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="relative">
                        <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">
                          search
                        </span>
                        <input
                          type="text"
                          aria-label="Tìm minh chứng hoặc nhận xét"
                          placeholder="Tìm minh chứng hoặc nhận xét..."
                          value={filters.query}
                          onChange={(e) => setFilter('query', e.target.value)}
                          className="w-full md:w-64 pl-8 pr-3 py-1.5 text-xs rounded-xl border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
                        />
                        {filters.query && (
                          <button
                            type="button"
                            aria-label="Xóa ô tìm kiếm"
                            onClick={() => setFilter('query', '')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface text-xs"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {view === 'insufficient' ? (
                    <StateCard
                      icon="find_in_page"
                      title="Chưa đủ căn cứ để nhận xét"
                      body={
                        profile.notice ||
                        'Chưa có câu trích nguyên văn nào khớp với bài viết đã công bố, nên hồ sơ chưa đưa ra nhận xét.'
                      }
                      hint={isTeacher ? undefined : 'Em có thể bấm “Cập nhật hồ sơ” để phân tích lại.'}
                      action={refreshButton('Phân tích lại')}
                    />
                  ) : filteredObservations.length === 0 ? (
                    <div className="bg-surface-container-lowest p-12 rounded-2xl border border-dashed border-outline-variant/50 text-center space-y-3 shadow-sm">
                      <span className="material-symbols-outlined text-4xl text-outline">search_off</span>
                      <p className="text-sm font-bold text-on-surface">Không tìm thấy nhận xét nào phù hợp</p>
                      <p className="text-xs text-on-surface-variant">
                        Hãy thử chọn bộ lọc khác hoặc bấm khôi phục để xem toàn bộ danh sách.
                      </p>
                      <button
                        type="button"
                        onClick={handleResetFilters}
                        className="px-4 py-1.5 bg-secondary text-white text-xs font-semibold rounded-xl hover:bg-secondary/90 transition-all shadow-sm"
                      >
                        Xóa bộ lọc
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {filteredObservations.map((obs) => {
                        const kind = KIND_STYLE[obs.kind] ?? KIND_STYLE.STYLE;
                        const observedOn = formatDate(obs.publishedAt);
                        return (
                          <div
                            key={obs.id}
                            className="glass-card rounded-2xl p-5 shadow-xs space-y-3.5 flex flex-col justify-between hover:border-secondary/50 hover:shadow-md transition-all group"
                          >
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-outline-variant/20">
                                <div className="flex items-center gap-2 min-w-0">
                                  {obs.genreLabel && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-secondary bg-surface-container-low/80 px-2 py-0.5 rounded-md border border-outline-variant/20 shrink-0">
                                      {obs.genreLabel}
                                    </span>
                                  )}
                                  <span className="text-xs font-bold text-on-surface truncate">{obs.traitName}</span>
                                </div>
                                <span
                                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${kind.bg}`}
                                >
                                  <span className="material-symbols-outlined text-xs">{kind.icon}</span>
                                  <span>{kind.label}</span>
                                </span>
                              </div>

                              <p className="text-xs sm:text-sm text-on-surface font-medium leading-relaxed">
                                {obs.description}
                              </p>

                              <div className="rounded-xl border border-secondary/20 bg-surface-container-low/40 backdrop-blur-xs p-3.5 space-y-2">
                                <div className="flex items-center justify-between gap-2 text-[11px] text-on-surface-variant">
                                  <span className="font-semibold text-secondary flex items-center gap-1">
                                    <span className="material-symbols-outlined text-xs">format_quote</span>
                                    <span>Trích nguyên văn từ bài viết của em</span>
                                  </span>
                                  <span className="text-[10px] font-mono text-outline shrink-0">Trang {obs.pageIndex}</span>
                                </div>

                                <blockquote className="font-merriweather italic text-xs text-on-surface leading-relaxed pl-3 border-l-2 border-secondary">
                                  &ldquo;{obs.evidenceQuote}&rdquo;
                                </blockquote>

                                <div className="pt-1 flex items-center justify-between gap-2 text-[10px] text-outline">
                                  <span className="truncate">
                                    Nguồn: <strong>{obs.assignmentTitle}</strong>
                                  </span>
                                  {observedOn && <span className="shrink-0">Công bố {observedOn}</span>}
                                </div>
                              </div>

                              {obs.practiceTip && (
                                <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs text-purple-900 flex items-start gap-2">
                                  <span className="material-symbols-outlined text-sm text-purple-600 shrink-0 mt-0.5">
                                    edit_note
                                  </span>
                                  <p className="leading-relaxed">
                                    <strong>Gợi ý luyện tập:</strong> {obs.practiceTip}
                                  </p>
                                </div>
                              )}
                            </div>

                            <div className="pt-3 border-t border-outline-variant/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs">
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-secondary">
                                <span className="material-symbols-outlined text-xs">smart_toy</span>
                                {obs.label || AI_LABEL}
                              </span>
                              {!isTeacher && obs.linkHref && (
                                <Link
                                  href={resultHref(obs.assignmentId)}
                                  className="text-xs text-secondary hover:underline font-semibold flex items-center gap-0.5 self-end sm:self-auto group-hover:translate-x-0.5 transition-transform"
                                >
                                  <span>Xem bài viết</span>
                                  <span className="material-symbols-outlined text-xs">arrow_forward</span>
                                </Link>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Papers the profile was built from */}
                <div className="glass-panel p-5 sm:p-6 rounded-2xl shadow-xs space-y-4">
                  <div>
                    <h2 className="text-sm sm:text-base font-bold font-merriweather text-on-surface">
                      Bài viết được phân tích
                    </h2>
                    <p className="text-xs text-on-surface-variant">
                      {profile.sources.length} bài đã được đọc vào hồ sơ, mới nhất trước
                    </p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {profile.sources.map((source) => (
                      <div key={source.resultId} className="glass-card rounded-xl p-4 space-y-2.5 flex flex-col justify-between">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-on-surface leading-snug">{source.assignmentTitle}</p>
                            <span className="text-[11px] font-semibold text-secondary shrink-0">
                              {source.evidenceCount} minh chứng
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-outline">
                            {source.genreLabel && (
                              <span className="font-bold uppercase tracking-wider text-secondary bg-surface-container-low/80 px-2 py-0.5 rounded-md border border-outline-variant/20">
                                {source.genreLabel}
                              </span>
                            )}
                            {source.publishedAt && <span>Công bố {formatDate(source.publishedAt)}</span>}
                          </div>
                          {source.publishedComment && (
                            <div className="p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/20 text-xs text-on-surface-variant flex items-start gap-2">
                              <span className="material-symbols-outlined text-sm text-primary shrink-0 mt-0.5">rate_review</span>
                              <p className="leading-relaxed line-clamp-3">
                                <strong className="text-on-surface">{source.publishedLabel || PUBLISHED_LABEL}:</strong>{' '}
                                {source.publishedComment}
                              </p>
                            </div>
                          )}
                        </div>
                        {!isTeacher && source.linkable !== false && (
                          <Link
                            href={resultHref(source.assignmentId)}
                            className="text-xs text-secondary hover:underline font-semibold flex items-center gap-0.5 self-end"
                          >
                            <span>Xem kết quả</span>
                            <span className="material-symbols-outlined text-xs">arrow_forward</span>
                          </Link>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Practice card */}
                {!isTeacher && (
                <div className="rounded-3xl bg-gradient-to-r from-secondary/95 via-secondary to-primary/95 p-6 sm:p-8 text-white shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative overflow-hidden">
                  <div className="absolute -right-16 -top-16 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                  <div className="space-y-2 max-w-2xl relative z-10">
                    <div className="flex items-center gap-2">
                      <span className="w-8 h-8 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center font-bold">
                        <span className="material-symbols-outlined text-lg">edit_note</span>
                      </span>
                      <span className="text-xs font-bold uppercase tracking-wider bg-white/15 px-2.5 py-0.5 rounded-full">
                        Luyện tập từ hồ sơ
                      </span>
                    </div>
                    <h3 className="text-lg sm:text-xl font-bold font-merriweather">
                      Chọn một gợi ý luyện tập và áp dụng ở bài viết tiếp theo
                    </h3>
                    <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
                      Mở lại bài viết để đối chiếu câu trích với nhận xét đã công bố, thử viết lại một câu hoặc một
                      đoạn theo gợi ý. Khi có bài mới được công bố kết quả, em bấm “Cập nhật hồ sơ” để xem thay đổi.
                    </p>
                  </div>

                  {latestSource ? (
                    <Link
                      href={resultHref(latestSource.assignmentId)}
                      className="px-6 py-3 bg-white text-secondary hover:bg-white/95 rounded-2xl font-bold text-sm shadow-md hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shrink-0 relative z-10"
                    >
                      <span>Mở bài mới nhất</span>
                      <span className="material-symbols-outlined text-base">arrow_forward</span>
                    </Link>
                  ) : null}
                </div>
                )}
              </>
            )}
          </>
        )}
      </div>
  );

  if (isTeacher) return <TeacherShell>{content}</TeacherShell>;
  return (
    <StudentShell headerTitle="Hồ sơ cá nhân" headerSubtitle="Chân dung Cây bút & Dấu ấn Văn phong">
      {content}
    </StudentShell>
  );
}

function Kpi({
  value,
  label,
  tone,
  labelTone = 'text-on-surface-variant',
}: {
  value: number;
  label: string;
  tone: string;
  labelTone?: string;
}) {
  return (
    <div className="p-3 glass-card rounded-2xl text-center space-y-0.5 shadow-xs">
      <div className={`text-2xl font-bold font-merriweather ${tone}`}>{value}</div>
      <div className={`text-[11px] font-semibold ${labelTone}`}>{label}</div>
    </div>
  );
}

function StateCard({
  icon,
  title,
  body,
  hint,
  action,
  tone = 'default',
}: {
  icon: string;
  title: string;
  body: string;
  hint?: string;
  action?: React.ReactNode;
  tone?: 'default' | 'warning';
}) {
  const iconTone = tone === 'warning' ? 'bg-amber-500/10 text-amber-600' : 'bg-secondary/10 text-secondary';
  return (
    <div className="glass-panel p-8 sm:p-10 rounded-2xl shadow-xs text-center space-y-3 flex flex-col items-center">
      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${iconTone}`}>
        <span className="material-symbols-outlined text-2xl">{icon}</span>
      </div>
      <p className="text-sm font-bold font-merriweather text-on-surface">{title}</p>
      <p className="text-xs text-on-surface-variant leading-relaxed max-w-xl">{body}</p>
      {hint && <p className="text-[11px] text-outline max-w-xl">{hint}</p>}
      {action ? <div className="pt-1">{action}</div> : null}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Đang tải hồ sơ văn phong">
      <div className="glass-panel rounded-3xl p-6 sm:p-8 shadow-sm animate-pulse">
        <div className="flex flex-col lg:flex-row gap-6 justify-between">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-surface-container" />
            <div className="space-y-2">
              <div className="h-5 w-48 rounded bg-surface-container" />
              <div className="h-4 w-32 rounded bg-surface-container" />
              <div className="h-3 w-72 max-w-full rounded bg-surface-container" />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 lg:w-96">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="h-16 rounded-2xl bg-surface-container" />
            ))}
          </div>
        </div>
      </div>
      <div className="glass-panel p-5 sm:p-6 rounded-2xl shadow-xs animate-pulse">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3, 4, 5, 6, 7].map((key) => (
            <div key={key} className="h-24 rounded-xl bg-surface-container" />
          ))}
        </div>
      </div>
      <p className="text-center text-xs text-on-surface-variant">Đang tải hồ sơ văn phong...</p>
    </div>
  );
}
