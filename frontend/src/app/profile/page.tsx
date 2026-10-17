'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import StudentShell from '@/components/StudentShell';
import { useAppStore } from '@/lib/store';
import {
  MOCK_BUI_HA_MY_PROFILE,
  WritingObservation,
} from '@/lib/mock/writingProfileData';
import { CENTRAL_ASSIGNMENT_ID } from '@/lib/mock/assignmentData';

export default function WritingProfilePage() {
  const { addToast } = useAppStore();

  // Local state for observations and filters
  const [observations] = useState<WritingObservation[]>(
    MOCK_BUI_HA_MY_PROFILE.observations
  );

  // Filter states
  const [selectedGenre, setSelectedGenre] = useState<'ALL' | 'NLVH' | 'NLXH'>('ALL');
  const [selectedKind, setSelectedKind] = useState<'ALL' | 'STRENGTH' | 'WEAKNESS' | 'STYLE' | 'RESOLVED'>('ALL');
  const [selectedTraitId, setSelectedTraitId] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedPipeline, setExpandedPipeline] = useState(false);

  // Stats calculation
  const supportedCount = useMemo(
    () => observations.filter((o) => o.status === 'SUPPORTED').length,
    [observations]
  );
  const resolvedCount = useMemo(
    () => observations.filter((o) => o.status === 'RESOLVED').length,
    [observations]
  );
  const provisionalCount = useMemo(
    () => observations.filter((o) => o.status === 'PROVISIONAL').length,
    [observations]
  );
  const styleCount = useMemo(
    () => observations.filter((o) => o.kind === 'STYLE').length,
    [observations]
  );

  // Filtered observations
  const filteredObservations = useMemo(() => {
    return observations.filter((item) => {
      if (selectedGenre !== 'ALL' && item.genre !== selectedGenre) return false;
      if (selectedKind !== 'ALL') {
        if (selectedKind === 'RESOLVED') {
          if (item.status !== 'RESOLVED') return false;
        } else {
          if (item.kind !== selectedKind) return false;
        }
      }
      if (selectedTraitId !== 'ALL' && item.traitId !== selectedTraitId) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchQuote = item.evidenceQuote.toLowerCase().includes(q);
        const matchTrait = item.traitName.toLowerCase().includes(q);
        const matchTitle = item.assignmentTitle.toLowerCase().includes(q);
        if (!matchDesc && !matchQuote && !matchTrait && !matchTitle) return false;
      }
      return true;
    });
  }, [observations, selectedGenre, selectedKind, selectedTraitId, searchQuery]);

  const handleResetFilters = () => {
    setSelectedGenre('ALL');
    setSelectedKind('ALL');
    setSelectedTraitId('ALL');
    setSearchQuery('');
    addToast('Đã khôi phục bộ lọc hồ sơ văn phong!', 'info');
  };

  // Helper styles based on kind
  const getKindBadgeStyle = (kind: string, status: string) => {
    if (status === 'RESOLVED') {
      return {
        bg: 'bg-emerald-50 text-emerald-800 border-emerald-200/80',
        dot: 'bg-emerald-500',
        icon: 'task_alt',
        label: 'Đã tiến bộ vượt bậc',
      };
    }
    if (kind === 'STRENGTH') {
      return {
        bg: 'bg-blue-50 text-blue-800 border-blue-200/80',
        dot: 'bg-blue-500',
        icon: 'verified',
        label: 'Điểm sáng năng lực',
      };
    }
    if (kind === 'WEAKNESS') {
      return {
        bg: 'bg-amber-50 text-amber-900 border-amber-200/80',
        dot: 'bg-amber-500',
        icon: 'trending_up',
        label: 'Điểm cần rèn luyện',
      };
    }
    return {
      bg: 'bg-purple-50 text-purple-800 border-purple-200/80',
      dot: 'bg-purple-500',
      icon: 'palette',
      label: 'Đặc trưng văn phong riêng',
    };
  };

  return (
    <StudentShell
      headerTitle="Hồ sơ cá nhân"
      headerSubtitle="Chân dung Cây bút & Dấu ấn Văn phong"
    >
      <div className="max-w-7xl mx-auto space-y-6 pb-12">
        {/* Top Demo Bar */}
        <div className="bg-surface-container-lowest p-3 sm:p-4 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-xl">fingerprint</span>
            <div>
              <span className="text-xs font-bold text-on-surface">
                Hồ sơ Chân dung Cây bút của em
              </span>
              <p className="text-[11px] text-on-surface-variant">
                Tổng hợp tự động qua AI Agent từ các bài viết đã công bố • Chuẩn hóa theo GDPT 2018
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={handleResetFilters}
              title="Khôi phục bộ lọc"
              className="p-1.5 rounded-lg border border-outline-variant/40 hover:bg-surface-container text-on-surface-variant text-xs flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-base">restart_alt</span>
              <span className="hidden sm:inline">Khôi phục lọc</span>
            </button>

            <Link
              href={`/assignments/${CENTRAL_ASSIGNMENT_ID}/socratic`}
              className="px-3 py-1.5 bg-gradient-to-r from-secondary to-primary text-white rounded-xl text-xs font-semibold hover:brightness-105 transition-all shadow-sm flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">psychology</span>
              <span>Thử phòng Socratic</span>
            </Link>
          </div>
        </div>

        {/* Hero: Student Persona Header Card */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-surface-container-lowest via-surface-container-low/40 to-secondary-container/20 border border-outline-variant/30 p-6 sm:p-8 shadow-sm">
          {/* Ambient decorative elements */}
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-secondary/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 right-1/4 w-48 h-48 bg-primary/5 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            {/* Avatar & Title */}
            <div className="flex items-start sm:items-center gap-4 sm:gap-5">
              <div className="relative">
                <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-gradient-to-tr from-secondary-container via-primary-container to-secondary text-on-secondary-container flex items-center justify-center font-bold text-2xl shadow-md border-2 border-surface-container-lowest">
                  HM
                </div>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center shadow-sm">
                  <span className="material-symbols-outlined text-xs">auto_awesome</span>
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold font-merriweather text-on-surface">
                    {MOCK_BUI_HA_MY_PROFILE.studentName}
                  </h1>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-surface-container text-on-surface-variant border border-outline-variant/40">
                    {MOCK_BUI_HA_MY_PROFILE.studentCode}
                  </span>
                  <span className="text-xs text-on-surface-variant font-medium">
                    {MOCK_BUI_HA_MY_PROFILE.className}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-900 font-bold text-xs sm:text-sm">
                  <span className="material-symbols-outlined text-amber-600 text-base">psychology</span>
                  <span>{MOCK_BUI_HA_MY_PROFILE.personaTitle}</span>
                </div>

                <p className="text-xs sm:text-sm text-on-surface-variant leading-relaxed max-w-2xl pt-1">
                  {MOCK_BUI_HA_MY_PROFILE.personaSummary}
                </p>
              </div>
            </div>

            {/* KPI Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 lg:w-96 shrink-0">
              <div className="p-3 bg-surface-container-lowest/90 backdrop-blur rounded-xl border border-outline-variant/30 text-center space-y-0.5 shadow-sm">
                <div className="text-2xl font-bold text-on-surface font-merriweather">
                  {observations.length}
                </div>
                <div className="text-[11px] font-semibold text-on-surface-variant">
                  Dẫn chứng trích xuất
                </div>
              </div>

              <div className="p-3 bg-surface-container-lowest/90 backdrop-blur rounded-xl border border-outline-variant/30 text-center space-y-0.5 shadow-sm">
                <div className="text-2xl font-bold text-blue-600 font-merriweather">
                  {supportedCount}
                </div>
                <div className="text-[11px] font-semibold text-blue-700">
                  Cô giáo xác nhận
                </div>
              </div>

              <div className="p-3 bg-surface-container-lowest/90 backdrop-blur rounded-xl border border-outline-variant/30 text-center space-y-0.5 shadow-sm">
                <div className="text-2xl font-bold text-emerald-600 font-merriweather">
                  {resolvedCount}
                </div>
                <div className="text-[11px] font-semibold text-emerald-700">
                  Đã tiến bộ vượt bậc
                </div>
              </div>

              <div className="p-3 bg-surface-container-lowest/90 backdrop-blur rounded-xl border border-outline-variant/30 text-center space-y-0.5 shadow-sm">
                <div className="text-2xl font-bold text-purple-600 font-merriweather">
                  {styleCount}
                </div>
                <div className="text-[11px] font-semibold text-purple-700">
                  Đặc trưng văn phong
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Synthesis Pipeline Visualizer Accordion */}
        <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setExpandedPipeline(!expandedPipeline)}
            className="w-full px-5 py-3.5 flex items-center justify-between text-left hover:bg-surface-container-low/40 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-secondary-fixed/60 text-secondary flex items-center justify-center">
                <span className="material-symbols-outlined text-base">hub</span>
              </div>
              <div>
                <span className="text-xs font-bold text-on-surface">
                  Cơ chế AI Agent tổng hợp Văn phong &amp; Cầu nối Socratic
                </span>
                <span className="text-[11px] text-on-surface-variant ml-2 hidden sm:inline">
                  (Quy trình: Bài làm &rarr; Chấm công bố &rarr; Trích xuất bằng chứng &rarr; Thẩm định &rarr; Cá nhân hóa)
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 text-xs text-on-surface-variant font-medium">
              <span>{expandedPipeline ? 'Thu gọn' : 'Xem chi tiết quy trình'}</span>
              <span className="material-symbols-outlined text-sm">
                {expandedPipeline ? 'expand_less' : 'expand_more'}
              </span>
            </div>
          </button>

          {expandedPipeline && (
            <div className="p-5 border-t border-outline-variant/20 bg-surface-container-low/20 space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-secondary font-bold">
                    <span className="w-5 h-5 rounded-full bg-secondary text-white text-[10px] flex items-center justify-center">1</span>
                    <span>Bài viết đã công bố</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Chỉ kích hoạt khi bài viết được cô giáo công bố kết quả chấm chính thức. Tuyệt đối không trích xuất từ bản nháp chưa kiểm định.
                  </p>
                </div>

                <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-primary font-bold">
                    <span className="w-5 h-5 rounded-full bg-primary text-white text-[10px] flex items-center justify-center">2</span>
                    <span>Agent trích dẫn nguyên văn</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Gemini 2.5 Flash trích xuất 0–6 nhận xét theo 8 chiều năng lực GDPT 2018, kèm đoạn trích dẫn nguyên văn offset UTF-16 từ chính bài viết của em.
                  </p>
                </div>

                <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-tertiary font-bold">
                    <span className="w-5 h-5 rounded-full bg-tertiary text-white text-[10px] flex items-center justify-center">3</span>
                    <span>Giáo viên thẩm định</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Cô Đặng Hoàng Loan rà soát các nhận xét sơ bộ để xác nhận điểm mạnh hoặc ghi nhận sự tiến bộ vượt bậc của em qua các bài sau.
                  </p>
                </div>

                <div className="p-3.5 bg-surface-container-lowest rounded-xl border border-outline-variant/30 space-y-1.5">
                  <div className="flex items-center gap-2 text-secondary font-bold">
                    <span className="w-5 h-5 rounded-full bg-secondary text-white text-[10px] flex items-center justify-center">4</span>
                    <span>Cầu nối Socratic gợi mở</span>
                  </div>
                  <p className="text-[11px] text-on-surface-variant leading-relaxed">
                    Khi em làm đề tiếp theo cùng thể loại, Trợ lý Socratic tự động đọc các điểm cần rèn luyện để đặt câu hỏi gợi mở giúp em tiến bộ.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-surface-container-lowest border border-secondary/20 flex items-center gap-3">
                <span className="material-symbols-outlined text-secondary text-xl">shield_with_heart</span>
                <p className="text-[11px] text-on-surface-variant leading-relaxed">
                  <strong>Nguyên tắc sư phạm bảo mật:</strong> Hồ sơ văn phong chỉ dùng để hỗ trợ em rèn luyện kĩ năng viết, tuyệt đối không can thiệp làm sai lệch điểm số chấm rubric khách quan ở bài tiếp theo.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Writing Traits Spectrum (8 Dimensions of Expression) */}
        <div className="bg-surface-container-lowest p-5 sm:p-6 rounded-2xl border border-outline-variant/30 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-sm sm:text-base font-bold font-merriweather text-on-surface">
                Phổ 8 Chiều Năng Lực Diễn Đạt GDPT 2018
              </h2>
              <p className="text-xs text-on-surface-variant">
                Bấm vào từng nhóm năng lực để lọc các minh chứng trích dẫn tương ứng bên dưới
              </p>
            </div>

            {selectedTraitId !== 'ALL' && (
              <button
                type="button"
                onClick={() => setSelectedTraitId('ALL')}
                className="text-xs text-secondary hover:underline font-semibold flex items-center gap-1 self-start sm:self-auto"
              >
                <span>Xem tất cả 8 nhóm</span>
                <span className="material-symbols-outlined text-sm">close</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {MOCK_BUI_HA_MY_PROFILE.traitsMetrics.map((trait) => {
              const isSelected = selectedTraitId === trait.traitId;
              return (
                <button
                  key={trait.traitId}
                  type="button"
                  onClick={() =>
                    setSelectedTraitId(isSelected ? 'ALL' : trait.traitId)
                  }
                  className={`text-left p-3.5 rounded-xl border transition-all ${
                    isSelected
                      ? 'border-secondary bg-secondary-fixed/20 shadow-sm ring-1 ring-secondary'
                      : 'border-outline-variant/30 bg-surface-container-low/30 hover:bg-surface-container-low/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-bold text-on-surface truncate">
                      {trait.traitName}
                    </span>
                    <span className="text-xs font-bold text-secondary font-mono">
                      {trait.scorePercent}%
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-1.5 bg-surface-container rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-secondary to-primary transition-all duration-500"
                      style={{ width: `${trait.scorePercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                    <span className="font-medium text-outline">{trait.level}</span>
                    <span className="font-semibold text-secondary">
                      {trait.observationsCount} nhận xét
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Observations Section with Interactive Filters */}
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="bg-surface-container-lowest p-4 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Genre & Kind Filters */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Genre Filter */}
              <div className="flex items-center bg-surface-container-low p-1 rounded-xl border border-outline-variant/30 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedGenre('ALL')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    selectedGenre === 'ALL'
                      ? 'bg-surface-container-lowest text-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Tất cả thể loại
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGenre('NLVH')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    selectedGenre === 'NLVH'
                      ? 'bg-surface-container-lowest text-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Nghị luận Văn học
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedGenre('NLXH')}
                  className={`px-3 py-1 rounded-lg font-medium transition-all ${
                    selectedGenre === 'NLXH'
                      ? 'bg-surface-container-lowest text-primary font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Nghị luận Xã hội
                </button>
              </div>

              {/* Kind Filter */}
              <div className="flex items-center bg-surface-container-low p-1 rounded-xl border border-outline-variant/30 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedKind('ALL')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    selectedKind === 'ALL'
                      ? 'bg-surface-container-lowest text-on-surface font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Tất cả ({observations.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKind('STRENGTH')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    selectedKind === 'STRENGTH'
                      ? 'bg-blue-50 text-blue-700 font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Điểm sáng
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKind('STYLE')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    selectedKind === 'STYLE'
                      ? 'bg-purple-50 text-purple-700 font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Văn phong riêng
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKind('WEAKNESS')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    selectedKind === 'WEAKNESS'
                      ? 'bg-amber-50 text-amber-800 font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Cần rèn luyện
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedKind('RESOLVED')}
                  className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                    selectedKind === 'RESOLVED'
                      ? 'bg-emerald-50 text-emerald-800 font-bold shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  Đã tiến bộ
                </button>
              </div>
            </div>

            {/* Search Box */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant text-base">
                search
              </span>
              <input
                type="text"
                placeholder="Tìm dẫn chứng hoặc nhận xét..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full md:w-64 pl-8 pr-3 py-1.5 text-xs rounded-xl border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-outline hover:text-on-surface text-xs"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Observations Feed */}
          {filteredObservations.length === 0 ? (
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
                const kindConfig = getKindBadgeStyle(obs.kind, obs.status);

                return (
                  <div
                    key={obs.id}
                    className="bg-surface-container-lowest rounded-2xl border border-outline-variant/30 p-5 shadow-sm space-y-3.5 flex flex-col justify-between hover:border-secondary/50 transition-all"
                  >
                    <div className="space-y-3">
                      {/* Header tags */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-outline-variant/20">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-secondary bg-surface-container-low px-2 py-0.5 rounded-md border border-outline-variant/20">
                            {obs.genre === 'NLVH' ? 'Nghị luận Văn học' : 'Nghị luận Xã hội'}
                          </span>
                          <span className="text-xs font-bold text-on-surface">
                            {obs.traitName}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${kindConfig.bg}`}
                          >
                            <span className="material-symbols-outlined text-xs">{kindConfig.icon}</span>
                            <span>{kindConfig.label}</span>
                          </span>
                        </div>
                      </div>

                      {/* Academic description */}
                      <p className="text-xs sm:text-sm text-on-surface font-medium leading-relaxed">
                        {obs.description}
                      </p>

                      {/* Verbatim quote callout */}
                      <div className="rounded-xl border border-secondary/20 bg-surface-container-low/50 p-3.5 space-y-2">
                        <div className="flex items-center justify-between text-[11px] text-on-surface-variant">
                          <span className="font-semibold text-secondary flex items-center gap-1">
                            <span className="material-symbols-outlined text-xs">format_quote</span>
                            <span>Minh chứng trích dẫn nguyên văn từ bài viết của em:</span>
                          </span>
                          <span className="text-[10px] font-mono text-outline">
                            [Offset: {obs.evidenceStart} &rarr; {obs.evidenceEnd}]
                          </span>
                        </div>

                        <blockquote className="font-merriweather italic text-xs text-on-surface leading-relaxed pl-3 border-l-2 border-secondary">
                          &ldquo;{obs.evidenceQuote}&rdquo;
                        </blockquote>

                        <div className="pt-1 flex items-center justify-between text-[10px] text-outline">
                          <span className="truncate max-w-[280px]">
                            Nguồn: <strong>{obs.assignmentTitle}</strong>
                          </span>
                          <span>{obs.observedAt}</span>
                        </div>
                      </div>

                      {/* Teacher feedback note */}
                      {obs.teacherFeedback && (
                        <div className="p-3 rounded-xl bg-surface-container-low/30 border border-outline-variant/20 text-xs text-on-surface-variant flex items-start gap-2">
                          <span className="material-symbols-outlined text-sm text-primary shrink-0 mt-0.5">
                            rate_review
                          </span>
                          <p className="leading-relaxed">
                            <strong className="text-on-surface">Lời phê giáo viên:</strong>{' '}
                            {obs.teacherFeedback}
                          </p>
                        </div>
                      )}

                      {/* Socratic Bridge Tip */}
                      {obs.socraticBridgeTip && (
                        <div className="p-3 rounded-xl bg-purple-500/5 border border-purple-500/20 text-xs text-purple-900 flex items-start gap-2">
                          <span className="material-symbols-outlined text-sm text-purple-600 shrink-0 mt-0.5">
                            psychology
                          </span>
                          <p className="leading-relaxed">
                            <strong>Cầu nối Socratic:</strong> {obs.socraticBridgeTip}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Footer */}
                    <div className="pt-3 border-t border-outline-variant/20 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 text-[11px] text-outline">
                        <span className="font-mono">ID: {obs.id.slice(0, 12)}</span>
                        <span>•</span>
                        <span className="font-semibold text-secondary">
                          {obs.statusLabel}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <Link
                          href={`/assignments/${obs.assessmentId}`}
                          className="text-xs text-secondary hover:underline font-semibold flex items-center gap-0.5"
                        >
                          <span>Xem bài viết</span>
                          <span className="material-symbols-outlined text-xs">arrow_forward</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Socratic Bridge Live Action Card */}
        <div className="rounded-3xl bg-gradient-to-r from-secondary/90 via-secondary to-primary p-6 sm:p-8 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-lg">psychology</span>
              </span>
              <span className="text-xs font-bold uppercase tracking-wider bg-white/15 px-2.5 py-0.5 rounded-full">
                Cá nhân hóa Socratic AI
              </span>
            </div>

            <h3 className="text-lg sm:text-xl font-bold font-merriweather">
              Trợ lý Socratic đã nạp Hồ sơ văn phong của em vào đề bài mới!
            </h3>

            <p className="text-xs sm:text-sm text-white/90 leading-relaxed">
              Khi em mở phòng lập dàn ý cho bài thơ <em>&ldquo;Màu tự do của đất&rdquo;</em>, AI sẽ chủ động khen ngợi vốn từ gợi hình của em và đặt câu hỏi gợi mở sâu hơn khi em so sánh liên hệ với tác giả khác.
            </p>
          </div>

          <Link
            href={`/assignments/${CENTRAL_ASSIGNMENT_ID}/socratic`}
            className="px-6 py-3 bg-white text-secondary hover:bg-white/95 rounded-2xl font-bold text-sm shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-2 shrink-0"
          >
            <span>Vào phòng Lập dàn ý Socratic</span>
            <span className="material-symbols-outlined text-base">arrow_forward</span>
          </Link>
        </div>
      </div>
    </StudentShell>
  );
}
