'use client';

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  Role,
  User,
  Assignment,
  Material,
  Rubric,
  SocraticMessage,
  OutlineSection,
  SubmissionResult,
} from './types';
import {
  MOCK_TEACHER,
  MOCK_STUDENT,
  MOCK_ASSIGNMENTS,
  MOCK_MATERIALS,
  MOCK_RUBRIC,
  MOCK_STUDENT_RESULT,
} from './mock/data';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

interface AppState {
  // Session
  currentUser: User;
  setRole: (role: Role) => void;
  setUser: (user: User) => void;
  logout: () => void;

  // Toasts
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;

  // Assignments & Rubric
  assignments: Assignment[];
  activeRubric: Rubric;
  updateRubricCriterion: (criterionId: string, updates: Partial<Rubric['criteria'][0]>) => void;
  addAssignment: (assignment: Assignment) => void;
  updateAssignment: (id: string, updates: Partial<Assignment>) => void;
  publishAssignment: (id: string, updates?: Partial<Assignment>) => void;

  // Student Submissions tracking
  submittedAssignmentIds: string[];
  submitAssignment: (id: string) => void;

  // Reset Demo
  resetDemoState: () => void;

  // Materials
  materials: Material[];
  addMaterial: (material: Omit<Material, 'id' | 'uploadedAt' | 'version'>) => void;

  // Outline
  outline: OutlineSection[];
  addOutlinePoint: (sectionId: string, point: string) => void;
  updateOutlinePoint: (sectionId: string, index: number, point: string) => void;
  removeOutlinePoint: (sectionId: string, index: number) => void;

  // Socratic Chat
  socraticMessages: SocraticMessage[];
  addSocraticMessage: (text: string) => void;

  // Submission & OCR
  uploadedPages: { id: string; url: string; size: string; piiMasked: boolean }[];
  addUploadedPage: (page: { id: string; url: string; size: string; piiMasked: boolean }) => void;
  removeUploadedPage: (id: string) => void;
  movePage: (fromIndex: number, toIndex: number) => void;
  piiStatus: 'success' | 'processing' | 'failed';
  setPiiStatus: (status: 'success' | 'processing' | 'failed') => void;

  // OCR Review
  flaggedSegments: { lineRef: number; text: string; confidence: number; isCorrected?: boolean }[];
  correctFlaggedSegment: (lineRef: number, newText: string) => void;
  ocrStatus: 'needs_review' | 'ready' | 'confirmed';
  setOcrStatus: (status: 'needs_review' | 'ready' | 'confirmed') => void;

  // Grading result
  studentResult: SubmissionResult;
}

const INITIAL_OUTLINE: OutlineSection[] = [
  {
    id: 'intro',
    title: 'I. Mở bài — Đặt vấn đề',
    points: [
      'Dẫn dắt từ bối cảnh chuyển đổi số và những áp lực thách thức của giới trẻ.',
      'Nêu vấn đề trọng tâm: Ý chí và lòng kiên định là kim chỉ nam định hình bản lĩnh người trẻ.',
    ],
  },
  {
    id: 'body',
    title: 'II. Thân bài — Triển khai luận điểm',
    points: [
      'Luận điểm 1: Giải thích bản chất của lòng kiên định (sự bền bỉ, dũng cảm đối diện nghịch cảnh, không dễ dàng bỏ cuộc).',
      'Luận điểm 2: Dẫn chứng thực tế — Tinh thần kiên trì của người trẻ khởi nghiệp và các tấm gương vượt khó học tập (Cần chi tiết hóa dẫn chứng).',
      'Luận điểm 3: Phản đề & Mở rộng — Phân biệt kiên định với bảo thủ mù quáng; kiên định phải đi liền với sự sáng suốt và biết lắng nghe.',
    ],
  },
  {
    id: 'conclusion',
    title: 'III. Kết bài — Đánh giá & Bài học',
    points: [
      'Khẳng định lại giá trị bền vững của lòng kiên định đối với tương lai mỗi cá nhân.',
      'Bài học hành động: Bắt đầu rèn luyện ý chí từ những thói quen học tập nhỏ mỗi ngày.',
    ],
  },
];

const INITIAL_SOCRATIC_MESSAGES: SocraticMessage[] = [
  {
    id: 'm1',
    sender: 'user',
    text: 'Em muốn nêu luận điểm: Người trẻ cần có lòng kiên định theo đuổi đam mê đến cùng dù gặp khó khăn.',
    timestamp: '09:15',
  },
  {
    id: 'm2',
    sender: 'ai',
    text: 'Em đã nêu được ý nghĩa cốt lõi của lòng kiên định trong việc theo đuổi mục tiêu cá nhân. Để bài viết có chiều sâu và đa chiều hơn, em hãy thử xem xét ranh giới khi nào sự kiên định có nguy cơ biến thành bảo thủ hoặc mù quáng. Theo em, người trẻ nên phân biệt hai điều này bằng dấu hiệu cụ thể nào trong thực tế?',
    timestamp: '09:16',
    canAddToOutline: true,
    outlinePoint: 'Phân biệt kiên định với bảo thủ mù quáng; cần có tư duy sáng suốt và biết lắng nghe phản biện.',
  },
  {
    id: 'm3',
    sender: 'user',
    text: 'AI viết giúp em 1 đoạn mở bài mẫu thật hay với.',
    timestamp: '09:18',
  },
  {
    id: 'm4',
    sender: 'ai',
    text: 'Trợ lý EduLit-AI không viết đoạn văn thay học sinh để bảo đảm quyền tự chủ sáng tạo của em. Thay vào đó, em hãy thử liên hệ trực tiếp từ một hiện tượng mạng hoặc một câu chuyện thực tế về sự nỗ lực mà em tâm đắc nhất. Em dự định dẫn dắt người đọc từ hình ảnh thực tế nào trước khi đi vào vấn đề lòng kiên định?',
    timestamp: '09:18',
  },
];

const GUIDING_QUESTION_BANK = [
  'Để luận điểm thêm thuyết phục, em có thể liên hệ với một tấm gương người trẻ thời đại số vượt qua thất bại như thế nào?',
  'Phần phản đề của em rất quan trọng: Em sẽ đối thoại như thế nào với những bạn trẻ cho rằng kiên định là thiếu linh hoạt?',
  'Trong bài học hành động, em dự định cụ thể hóa việc rèn luyện tính kiên định vào những việc thực tế nào mỗi ngày?',
  'Em có thể làm rõ hơn sự khác biệt giữa đam mê nhất thời với sự kiên định bền bỉ qua năm tháng bằng hình ảnh ẩn dụ nào?',
];

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: MOCK_TEACHER,
      setRole: (role: Role) => {
        if (role === 'teacher') {
          set({ currentUser: MOCK_TEACHER });
        } else {
          set({ currentUser: MOCK_STUDENT });
        }
      },
      setUser: (user: User) => set({ currentUser: user }),
      logout: () => {
        set({ currentUser: MOCK_TEACHER });
      },

      toasts: [],
      addToast: (message: string, type: ToastMessage['type'] = 'info') => {
        const id = Math.random().toString(36).substring(2, 9);
        set((state) => ({ toasts: [...state.toasts, { id, message, type }] }));
        setTimeout(() => {
          get().removeToast(id);
        }, 3500);
      },
      removeToast: (id: string) => {
        set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
      },

      assignments: MOCK_ASSIGNMENTS,
      activeRubric: MOCK_RUBRIC,
      updateRubricCriterion: (criterionId, updates) => {
        set((state) => ({
          activeRubric: {
            ...state.activeRubric,
            criteria: state.activeRubric.criteria.map((c) =>
              c.id === criterionId ? { ...c, ...updates } : c
            ),
          },
        }));
      },
      addAssignment: (assignment) => {
        set((state) => ({ assignments: [assignment, ...state.assignments] }));
      },
      updateAssignment: (id, updates) => {
        set((state) => ({
          assignments: state.assignments.map((a) =>
            a.id === id ? { ...a, ...updates } : a
          ),
        }));
      },
      publishAssignment: (id, updates) => {
        set((state) => {
          const exists = state.assignments.some((a) => a.id === id);
          if (exists) {
            return {
              assignments: state.assignments.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      status: 'published',
                      statusLabel: 'Đã giao',
                      ...updates,
                    }
                  : a
              ),
            };
          } else if (updates) {
            const newAssignment: Assignment = {
              id,
              code: `VAN12-NL-${Math.floor(10 + Math.random() * 90)}`,
              title: updates.title || 'Bài tập mới',
              studentTitle: updates.title || 'Bài tập mới',
              topic: updates.title || 'Bài tập mới',
              instructions: updates.instructions || '',
              gradeLevel: 12,
              classId: '12A1',
              className: 'Lớp 12A1 • THPT Đan Phượng (40 HS)',
              status: 'published',
              statusLabel: 'Đã giao',
              deadline: updates.deadline || '30/11/2024 23:59',
              totalSubmissions: 0,
              assessedSubmissions: 0,
              flaggedSubmissions: 0,
              rubricId: 'RUBRIC_V12_NLXH_2026',
              linkedMaterialIds: ['mat-ngulieu-04', 'mat-barem-2024'],
              learningGoals: [],
              ...updates,
            };
            return {
              assignments: [newAssignment, ...state.assignments],
            };
          }
          return state;
        });
      },

      materials: MOCK_MATERIALS,
      addMaterial: (materialData) => {
        const newId = `mat-${Date.now()}`;
        const newMat: Material = {
          ...materialData,
          id: newId,
          version: 'v1.0',
          uploadedAt: 'Hôm nay ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        set((state) => ({ materials: [newMat, ...state.materials] }));
      },

      outline: INITIAL_OUTLINE,
      addOutlinePoint: (sectionId, point) => {
        set((state) => ({
          outline: state.outline.map((sec) =>
            sec.id === sectionId ? { ...sec, points: [...sec.points, point] } : sec
          ),
        }));
      },
      updateOutlinePoint: (sectionId, index, point) => {
        set((state) => ({
          outline: state.outline.map((sec) => {
            if (sec.id !== sectionId) return sec;
            const newPoints = [...sec.points];
            newPoints[index] = point;
            return { ...sec, points: newPoints };
          }),
        }));
      },
      removeOutlinePoint: (sectionId, index) => {
        set((state) => ({
          outline: state.outline.map((sec) => {
            if (sec.id !== sectionId) return sec;
            return { ...sec, points: sec.points.filter((_, i) => i !== index) };
          }),
        }));
      },

      socraticMessages: INITIAL_SOCRATIC_MESSAGES,
      addSocraticMessage: (userText: string) => {
        const userMsg: SocraticMessage = {
          id: `msg-${Date.now()}`,
          sender: 'user',
          text: userText,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };

        set((state) => ({ socraticMessages: [...state.socraticMessages, userMsg] }));

        // Simulate AI response
        setTimeout(() => {
          let aiText = '';
          const isRefusal = /viết hộ|viết giúp|đoạn mẫu|bài mẫu/i.test(userText);

          if (isRefusal) {
            aiText =
              'Trợ lý EduLit-AI không viết thay hoặc cung cấp đoạn văn mẫu cho học sinh. Em hãy tự phác thảo ý tưởng của mình, bắt đầu từ hình ảnh hoặc thông điệp em muốn gửi gắm. Em dự định mở bài bằng câu trích dẫn hay một dẫn chứng đời sống?';
          } else {
            const randomQuestion =
              GUIDING_QUESTION_BANK[Math.floor(Math.random() * GUIDING_QUESTION_BANK.length)];
            aiText = `Ý kiến của em rất đáng ghi nhận và có tính khám phá. ${randomQuestion}`;
          }

          const aiMsg: SocraticMessage = {
            id: `msg-${Date.now() + 1}`,
            sender: 'ai',
            text: aiText,
            timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            canAddToOutline: !isRefusal,
            outlinePoint: !isRefusal ? userText : undefined,
          };

          set((state) => ({ socraticMessages: [...state.socraticMessages, aiMsg] }));
        }, 750);
      },

      uploadedPages: [
        { id: 'p1', url: '/mock-paper-1.jpg', size: '2.4 MB', piiMasked: true },
        { id: 'p2', url: '/mock-paper-2.jpg', size: '1.9 MB', piiMasked: true },
      ],
      addUploadedPage: (page) => {
        set((state) => ({ uploadedPages: [...state.uploadedPages, page] }));
      },
      removeUploadedPage: (id) => {
        set((state) => ({ uploadedPages: state.uploadedPages.filter((p) => p.id !== id) }));
      },
      movePage: (fromIndex, toIndex) => {
        set((state) => {
          const list = [...state.uploadedPages];
          const [moved] = list.splice(fromIndex, 1);
          list.splice(toIndex, 0, moved);
          return { uploadedPages: list };
        });
      },
      piiStatus: 'success',
      setPiiStatus: (status) => set({ piiStatus: status }),

      flaggedSegments: [
        { lineRef: 14, text: 'sáng suốt', confidence: 0.71, isCorrected: false },
      ],
      correctFlaggedSegment: (lineRef, newText) => {
        set((state) => ({
          flaggedSegments: state.flaggedSegments.map((seg) =>
            seg.lineRef === lineRef ? { ...seg, text: newText, isCorrected: true } : seg
          ),
        }));
      },
      ocrStatus: 'needs_review',
      setOcrStatus: (status) => set({ ocrStatus: status }),

      studentResult: MOCK_STUDENT_RESULT,

      submittedAssignmentIds: [],
      submitAssignment: (id) => {
        set((state) => ({
          submittedAssignmentIds: state.submittedAssignmentIds.includes(id)
            ? state.submittedAssignmentIds
            : [...state.submittedAssignmentIds, id],
          assignments: state.assignments.map((a) =>
            a.id === id
              ? {
                  ...a,
                  totalSubmissions: (a.totalSubmissions || 0) + 1,
                  assessedSubmissions: (a.assessedSubmissions || 0) + 1,
                }
              : a
          ),
        }));
      },

      resetDemoState: () => {
        set({
          currentUser: MOCK_TEACHER,
          assignments: MOCK_ASSIGNMENTS,
          activeRubric: MOCK_RUBRIC,
          materials: MOCK_MATERIALS,
          outline: INITIAL_OUTLINE,
          socraticMessages: INITIAL_SOCRATIC_MESSAGES,
          uploadedPages: [
            { id: 'p1', url: '/mock-paper-1.jpg', size: '2.4 MB', piiMasked: true },
            { id: 'p2', url: '/mock-paper-2.jpg', size: '1.9 MB', piiMasked: true },
          ],
          piiStatus: 'success',
          flaggedSegments: [
            { lineRef: 14, text: 'sáng suốt', confidence: 0.71, isCorrected: false },
          ],
          ocrStatus: 'needs_review',
          studentResult: MOCK_STUDENT_RESULT,
          submittedAssignmentIds: [],
        });
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('edulit-ai-storage');
        }
      },
    }),
    {
      name: 'edulit-ai-storage',
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

