'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import TeacherShell from '@/components/TeacherShell';
import StudentShell from '@/components/StudentShell';
import { useAppStore } from '@/lib/store';
import { Material } from '@/lib/types';

export default function MaterialsPage() {
  const { currentUser, materials, addMaterial, addToast } = useAppStore();

  const isTeacher = currentUser.role === 'teacher';

  const [selectedMaterialId, setSelectedMaterialId] = useState<string>(materials[0]?.id || 'mat-ngulieu-mau-tu-do-dat');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterPurpose, setFilterPurpose] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Add material drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [addMethod, setAddMethod] = useState<'upload' | 'paste'>('upload');
  const [newTitle, setNewTitle] = useState('');
  const [newPurpose, setNewPurpose] = useState<Material['purpose']>('Ngữ liệu');
  const [pastedText, setPastedText] = useState('');
  const [forceFail, setForceFail] = useState(false);
  const [isProcessingUpload, setIsProcessingUpload] = useState(false);

  const selectedMaterial = materials.find((m) => m.id === selectedMaterialId) || materials[0];

  const filteredMaterials = materials.filter((m) => {
    if (searchQuery && !m.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterPurpose !== 'all' && m.purpose !== filterPurpose) return false;
    if (filterStatus !== 'all' && m.status !== filterStatus) return false;
    return true;
  });

  const handleCreateMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) {
      addToast('Vui lòng nhập tên học liệu.', 'warning');
      return;
    }

    setIsProcessingUpload(true);
    addToast('Đang tải lên và phân tích bóc tách ngữ liệu...', 'info');

    setTimeout(() => {
      setIsProcessingUpload(false);
      setDrawerOpen(false);

      if (forceFail) {
        addMaterial({
          title: newTitle,
          purpose: newPurpose,
          classId: '12A1',
          status: 'FAILED',
          errorMessage: 'Quét scan mờ, văn bản bị đứt nét không thể bóc tách cấu trúc.',
        });
        addToast('Xử lý học liệu thất bại do chất lượng file scan.', 'error');
      } else {
        addMaterial({
          title: newTitle,
          purpose: newPurpose,
          classId: '12A1',
          status: 'READY',
          excerpt: pastedText || '“Học liệu mới đã được chuẩn hóa ngữ nghĩa và sẵn sàng liên kết với các bài viết của khối 12.”',
        });
        addToast('Bóc tách học liệu thành công! Trạng thái: Sẵn sàng.', 'success');
      }

      setNewTitle('');
      setPastedText('');
    }, 1500);
  };

  const content = (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-headline-lg text-2xl sm:text-3xl font-bold text-on-surface font-merriweather">
            Kho Học liệu &amp; Quản lý Ngữ liệu GDPT 2018
          </h1>
          <p className="text-xs sm:text-sm text-on-surface-variant mt-1">
            Học liệu sẵn sàng được dùng làm ngữ cảnh chuẩn cho Socratic gợi mở và AI đối chiếu rubric chấm bài.
          </p>
        </div>

        {isTeacher && (
          <button
            onClick={() => setDrawerOpen(true)}
            className="px-4 py-2 bg-primary-container text-on-primary-container font-semibold rounded-lg text-sm hover:brightness-95 flex items-center gap-2 shadow-sm shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            <span>+ Thêm học liệu mới</span>
          </button>
        )}
      </div>

      {/* Toolbar */}
      <div className="p-4 bg-surface-container-lowest rounded-xl border border-outline-variant/30 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          <div className="relative flex-1 max-w-xs">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm theo tiêu đề học liệu..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
            />
            <span className="material-symbols-outlined absolute left-2.5 top-2 text-outline text-base">
              search
            </span>
          </div>

          <select
            value={filterPurpose}
            onChange={(e) => setFilterPurpose(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
          >
            <option value="all">Tất cả phân loại</option>
            <option value="Ngữ liệu">Ngữ liệu đọc hiểu</option>
            <option value="Barem">Barem thang điểm</option>
            <option value="Giáo án">Giáo án chuyên đề</option>
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2.5 py-1.5 text-xs rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="READY">Sẵn sàng (Ready)</option>
            <option value="PROCESSING">Đang xử lý</option>
            <option value="FAILED">Xử lý thất bại</option>
          </select>
        </div>

        <span className="text-xs text-on-surface-variant">
          Hiển thị <strong>{filteredMaterials.length}</strong> học liệu
        </span>
      </div>

      {/* Main Split View: Left List, Right Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left List */}
        <div className="lg:col-span-5 space-y-3">
          {filteredMaterials.map((item) => {
            const isSelected = item.id === selectedMaterial.id;
            return (
              <div
                key={item.id}
                onClick={() => setSelectedMaterialId(item.id)}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  isSelected
                    ? 'bg-surface-container-lowest border-secondary shadow-md ring-1 ring-secondary'
                    : 'bg-surface-container-lowest border-outline-variant/30 hover:border-outline-variant/70 shadow-sm'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-1.5">
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      item.purpose === 'Ngữ liệu'
                        ? 'bg-secondary-fixed/60 text-secondary'
                        : item.purpose === 'Barem'
                        ? 'bg-primary-fixed text-primary'
                        : 'bg-surface-container text-on-surface-variant'
                    }`}
                  >
                    {item.purpose}
                  </span>

                  <span
                    className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                      item.status === 'READY'
                        ? 'bg-tertiary-container/30 text-tertiary'
                        : item.status === 'PROCESSING'
                        ? 'bg-surface-container-high text-[#CA8A04]'
                        : 'bg-error-container text-error'
                    }`}
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                    {item.status === 'READY'
                      ? 'Sẵn sàng'
                      : item.status === 'PROCESSING'
                      ? 'Đang xử lý'
                      : 'Thất bại'}
                  </span>
                </div>

                <h3 className="font-headline-sm text-sm font-bold text-on-surface font-merriweather line-clamp-2">
                  {item.title}
                </h3>

                <div className="mt-3 flex items-center justify-between text-[11px] text-on-surface-variant">
                  <span>Phiên bản: {item.version}</span>
                  <span>{item.uploadedAt}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Detail / Preview Panel */}
        <div className="lg:col-span-7">
          <div className="bg-surface-container-lowest rounded-xl p-6 border border-outline-variant/30 shadow-sm space-y-5">
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-outline-variant/20">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs bg-surface-container px-2 py-0.5 rounded font-mono font-semibold text-secondary">
                    {selectedMaterial.id}
                  </span>
                  <span className="text-xs text-on-surface-variant font-medium">
                    Lớp: {selectedMaterial.classId} • THPT Đan Phượng
                  </span>
                </div>
                <h2 className="font-headline-md text-lg sm:text-xl font-bold text-on-surface font-merriweather">
                  {selectedMaterial.title}
                </h2>
              </div>

              {selectedMaterial.status === 'READY' && isTeacher && (
                <Link
                  href="/assignments/assign-nlvh-mau-tu-do-dat"
                  className="px-3 py-1.5 bg-primary-container text-on-primary-container text-xs font-semibold rounded-lg hover:brightness-95 shrink-0 transition-all flex items-center gap-1 shadow-sm"
                >
                  <span>Áp dụng Barem này</span>
                  <span className="material-symbols-outlined text-sm">arrow_forward</span>
                </Link>
              )}
            </div>

            {selectedMaterial.status === 'FAILED' ? (
              <div className="p-4 bg-error-container/50 border border-error/30 rounded-xl space-y-3">
                <div className="flex items-start gap-2 text-error">
                  <span className="material-symbols-outlined text-xl">error</span>
                  <div>
                    <h4 className="text-xs font-bold">Xử lý học liệu thất bại</h4>
                    <p className="text-xs text-on-error-container/90 mt-1 leading-relaxed">
                      {selectedMaterial.errorMessage}
                    </p>
                  </div>
                </div>
                <div className="pt-2 flex items-center gap-2">
                  <button
                    onClick={() => addToast('Đang chạy lại pipeline bóc tách OCR...', 'info')}
                    className="px-3 py-1.5 bg-surface-container-lowest text-xs font-semibold text-error border border-error/40 rounded-lg hover:bg-error-container/20 transition-all"
                  >
                    Thử lại phân tích
                  </button>
                  <button
                    onClick={() => setDrawerOpen(true)}
                    className="px-3 py-1.5 text-xs text-on-surface-variant hover:text-on-surface font-medium"
                  >
                    Chọn tài liệu khác thay thế
                  </button>
                </div>
              </div>
            ) : selectedMaterial.status === 'PROCESSING' ? (
              <div className="p-8 text-center bg-surface-container-low/50 rounded-xl border border-outline-variant/30 space-y-3">
                <span className="w-8 h-8 border-2 border-secondary border-t-transparent rounded-full animate-spin inline-block"></span>
                <h4 className="text-sm font-bold text-on-surface">Đang phân tích cấu trúc tài liệu</h4>
                <p className="text-xs text-on-surface-variant max-w-sm mx-auto">
                  Hệ thống đang tiến hành semantic chunking, bóc tách luận điểm chính và gắn metadata GDPT 2018...
                </p>
              </div>
            ) : (
              <>
                {/* Excerpt Section */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-outline block">
                    Đoạn trích dẫn ngữ liệu chuẩn hóa:
                  </span>
                  <div className="p-4 bg-surface-container-low/40 rounded-xl border-l-4 border-primary text-xs sm:text-sm font-merriweather italic text-on-surface leading-relaxed">
                    {selectedMaterial.excerpt}
                  </div>
                </div>

                {/* Socratic Starter Questions preview */}
                <div className="space-y-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-outline block">
                    Gợi ý câu hỏi Socratic bóc tách được:
                  </span>
                  <ul className="space-y-1.5 text-xs text-on-surface-variant">
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-secondary text-sm mt-0.5">help</span>
                      <span>Hình ảnh khói rơm rạ và sự chuyển đổi cảm giác trong &quot;hít thở mầu tự do&quot; gợi tả điều gì?</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-secondary text-sm mt-0.5">help</span>
                      <span>Nghịch lí &quot;không thoát ly bùn đất&quot; làm sáng tỏ điều gì về khát vọng và cội nguồn gắn bó?</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-secondary text-sm mt-0.5">help</span>
                      <span>Chuỗi động từ &quot;buộc – neo – cởi&quot; kết nối không gian làng quê và ngọn khói ra sao?</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="material-symbols-outlined text-secondary text-sm mt-0.5">help</span>
                      <span>Liên hệ với &quot;Bếp lửa&quot; (Bằng Việt) hoặc &quot;Quê hương&quot; (Tế Hanh) để làm rõ nét riêng của Trần Quang Quý.</span>
                    </li>
                  </ul>
                </div>

                {/* Metadata & Rules */}
                <div className="p-3 bg-surface-container-low/60 rounded-xl border border-outline-variant/20 text-xs text-on-surface-variant flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-tertiary text-base">verified</span>
                    Học liệu sẵn sàng được dùng cho hướng dẫn và đánh giá bài viết của đề tương ứng.
                  </span>
                  <span className="font-semibold text-secondary">Đã kiểm duyệt</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Material Drawer / Modal */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-surface-container-lowest rounded-xl max-w-lg w-full p-6 shadow-xl border border-outline-variant/30 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-outline-variant/20">
              <h3 className="font-headline-sm text-base font-bold text-on-surface font-merriweather">
                Thêm học liệu mới vào Kho
              </h3>
              <button
                onClick={() => setDrawerOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Method Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 bg-surface-container-low rounded-lg text-xs">
              <button
                type="button"
                onClick={() => setAddMethod('upload')}
                className={`py-1.5 rounded-md font-semibold transition-all ${
                  addMethod === 'upload' ? 'bg-surface-container-lowest text-secondary shadow-sm' : 'text-on-surface-variant'
                }`}
              >
                Tải file (.PDF, .DOCX, .TXT)
              </button>
              <button
                type="button"
                onClick={() => setAddMethod('paste')}
                className={`py-1.5 rounded-md font-semibold transition-all ${
                  addMethod === 'paste' ? 'bg-surface-container-lowest text-secondary shadow-sm' : 'text-on-surface-variant'
                }`}
              >
                Dán văn bản trực tiếp
              </button>
            </div>

            <form onSubmit={handleCreateMaterial} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-on-surface mb-1">Tên học liệu / Tài liệu</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="VD: Văn bản đọc hiểu số 05: Khát vọng tuổi trẻ"
                  className="w-full px-3 py-2 rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-on-surface mb-1">Mục đích học liệu</label>
                  <select
                    value={newPurpose}
                    onChange={(e) => setNewPurpose(e.target.value as Material['purpose'])}
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary"
                  >
                    <option value="Ngữ liệu">Ngữ liệu đọc hiểu</option>
                    <option value="Giáo án">Giáo án chuyên đề</option>
                    <option value="Đề bài">Đề bài kiểm tra</option>
                    <option value="Barem">Barem rubric chấm</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-on-surface mb-1">Gắn với lớp</label>
                  <input
                    type="text"
                    disabled
                    value="Lớp 12A1 • THPT Đan Phượng"
                    className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 bg-surface-container-low text-on-surface-variant"
                  />
                </div>
              </div>

              {addMethod === 'upload' ? (
                <div className="p-6 border-2 border-dashed border-outline-variant/60 rounded-xl text-center bg-surface-container-low/40">
                  <span className="material-symbols-outlined text-3xl text-secondary mb-1">upload_file</span>
                  <p className="font-semibold text-on-surface">Kéo thả file tài liệu hoặc nhấn để chọn</p>
                  <p className="text-[11px] text-on-surface-variant mt-0.5">
                    Hỗ trợ định dạng: <strong>.pdf, .docx, .txt</strong> (Dung lượng cấu hình theo chính sách trường)
                  </p>
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-on-surface mb-1">Nội dung văn bản</label>
                  <textarea
                    rows={4}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                    placeholder="Dán nội dung ngữ liệu hoặc tiêu chí barem vào đây..."
                    className="w-full p-2.5 rounded-lg border border-outline-variant/60 bg-surface text-on-surface focus:outline-none focus:border-secondary font-mono text-[11px]"
                  />
                </div>
              )}



              <div className="pt-3 border-t border-outline-variant/20 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="px-3.5 py-2 rounded-lg text-on-surface-variant hover:bg-surface-container font-medium"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isProcessingUpload}
                  className="px-4 py-2 bg-primary-container text-on-primary-container font-semibold rounded-lg hover:brightness-95 transition-all flex items-center gap-1.5 shadow-sm"
                >
                  {isProcessingUpload ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-on-primary-container border-t-transparent rounded-full animate-spin"></span>
                      <span>Đang tải lên &amp; Phân tích...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-base">cloud_upload</span>
                      <span>Tải lên và Chuẩn hóa</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );

  if (isTeacher) {
    return <TeacherShell>{content}</TeacherShell>;
  }

  return (
    <StudentShell headerTitle="Kho học liệu" headerSubtitle="Tra cứu văn bản đọc hiểu">
      {content}
    </StudentShell>
  );
}

