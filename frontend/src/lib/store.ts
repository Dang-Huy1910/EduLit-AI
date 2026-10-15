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
  StudentSubmission,
  SubmissionPageImage,
} from './types';
import {
  CENTRAL_ASSIGNMENT_ID,
  CENTRAL_ASSIGNMENT,
  RUBRIC_MAU_TU_DO_DAT,
  RUBRIC_CAPACITY_CREATIVE_5T,
  AVAILABLE_RUBRICS,
  MATERIALS_MAU_TU_DO_DAT,
  DEMO_TEACHER,
  DEMO_STUDENTS,
} from './mock/assignmentData';
import {
  INITIAL_SUBMISSIONS,
  SUBMISSION_MANIFEST,
} from './mock/submissionsManifest';
import {
  matchSocraticBranch,
  FALLBACK_RESPONSE,
} from './mock/socraticScript';

export interface ToastMessage {
  id: string;
  type: 'success' | 'info' | 'warning' | 'error';
  message: string;
}

export type DemoMilestone = 'start' | 'complete';

interface AppState {
  // Session
  currentUser: User;
  setRole: (role: Role) => void;
  setUser: (user: User) => void;
  switchDemoUser: (userId: string) => void;
  logout: () => void;

  // Sidebar Layout
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Toasts
  toasts: ToastMessage[];
  addToast: (message: string, type?: ToastMessage['type']) => void;
  removeToast: (id: string) => void;

  // Milestone & Reset
  demoMilestone: DemoMilestone;
  setDemoMilestone: (milestone: DemoMilestone) => void;
  resetDemoState: () => void;

  // Assignments & Rubric
  assignments: Assignment[];
  activeAssignmentId: string;
  activeRubric: Rubric;
  rubrics: Rubric[];
  materials: Material[];
  updateRubricCriterion: (criterionId: string, updates: Partial<Rubric['criteria'][0]>) => void;
  selectAssignmentRubric: (assignmentId: string, rubricId: string) => void;
  setActiveRubricById: (rubricId: string) => void;
  publishAssignment: (id: string, updates?: Partial<Assignment>) => void;
  addMaterial: (material: Omit<Material, 'id' | 'uploadedAt' | 'version'>) => void;

  // Submissions Map (keyed by submissionId)
  submissions: Record<string, StudentSubmission>;
  submittedAssignmentIds: string[]; // for currently logged-in student
  getStudentSubmission: (assignmentId: string, studentId: string) => StudentSubmission | undefined;
  updateStudentGrading: (
    submissionId: string,
    updates: {
      evaluations?: StudentSubmission['evaluations'];
      teacherNotes?: string;
    }
  ) => void;
  publishStudentResult: (submissionId: string) => void;

  // Outline (keyed by `${assignmentId}_${studentId}`)
  outline: OutlineSection[];
  addOutlinePoint: (sectionId: string, point: string) => boolean;
  updateOutlinePoint: (sectionId: string, index: number, point: string) => void;
  removeOutlinePoint: (sectionId: string, index: number) => void;
  reorderOutlinePoints: (sectionId: string, fromIndex: number, toIndex: number) => void;

  // Socratic Chat (keyed by student)
  socraticMessages: SocraticMessage[];
  isAiResponding: boolean;
  sendSocraticMessage: (userText: string) => void;

  // Submission Photos & Upload
  uploadedPages: SubmissionPageImage[];
  loadDemoBuiHaMyPages: () => void;
  addCustomUploadedPage: (page: SubmissionPageImage) => void;
  removeUploadedPage: (pageIndex: number) => void;
  reorderUploadedPages: (fromIndex: number, toIndex: number) => void;
  submitHandwrittenEssay: (assignmentId: string) => void;

  // OCR Verification
  ocrStatus: 'needs_review' | 'confirmed';
  setOcrStatus: (status: 'needs_review' | 'confirmed') => void;
  flaggedSegments: { lineRef: number; text: string; note: string; isCorrected?: boolean }[];
  correctFlaggedSegment: (lineRef: number, newText: string) => void;
  updateTranscriptionLine: (
    submissionId: string,
    pageIndex: number,
    lineIndex: number,
    newText: string
  ) => void;
}

// Initial Outline for Bùi Hà My
const INITIAL_OUTLINE: OutlineSection[] = [
  {
    id: 'intro',
    title: 'I. Mở bài — Đặt vấn đề',
    points: [
      'Giới thiệu tác giả Trần Quang Quý và bài thơ "Màu tự do của đất".',
    ],
  },
  {
    id: 'body',
    title: 'II. Thân bài — Triển khai luận điểm',
    points: [
      'Hình ảnh ngọn khói cay mùi rơm rạ dắt về cánh đồng và cội nguồn làng quê.',
    ],
  },
  {
    id: 'conclusion',
    title: 'III. Kết bài — Đánh giá & Thông điệp',
    points: [
      'Khái quát chiều sâu suy tưởng của bài thơ về đất đai và tự do.',
    ],
  },
];

// Initial Socratic Welcome Message
const INITIAL_SOCRATIC_MESSAGES: SocraticMessage[] = [
  {
    id: 'msg-welcome',
    sender: 'ai',
    text:
      'Chào em! Cô là Trợ lý gợi mở Socratic đồng hành cùng em trong đề bài: Phân tích bài thơ "Màu tự do của đất" (Trần Quang Quý). Em có thể bấm các gợi ý nhanh bên dưới hoặc tự gõ câu hỏi để cùng tìm hiểu cách cảm nhận tự do qua hình ảnh làng quê, nghịch lí "không thoát ly bùn đất" và liên hệ với các thi phẩm khác nhé!',
    timestamp: '08:00',
    canAddToOutline: false,
  },
];

// Storage for active timeout to cancel on reset
let activeAiResponseTimeout: NodeJS.Timeout | null = null;

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // Session
      currentUser: DEMO_TEACHER,
      setRole: (role: Role) => {
        if (role === 'teacher') {
          set({ currentUser: DEMO_TEACHER });
        } else {
          set({ currentUser: DEMO_STUDENTS[0] }); // Bùi Hà My
        }
      },
      setUser: (user: User) => set({ currentUser: user }),
      switchDemoUser: (userId: string) => {
        if (userId === DEMO_TEACHER.id) {
          set({ currentUser: DEMO_TEACHER });
        } else {
          const matched = DEMO_STUDENTS.find((s) => s.id === userId);
          if (matched) {
            set({ currentUser: matched });
          }
        }
      },
      logout: () => {
        set({ currentUser: DEMO_TEACHER });
      },

      // Sidebar Layout
      sidebarCollapsed: false,
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

      // Toasts
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

      // Milestone
      demoMilestone: 'start',
      setDemoMilestone: (milestone: DemoMilestone) => {
        if (activeAiResponseTimeout) {
          clearTimeout(activeAiResponseTimeout);
          activeAiResponseTimeout = null;
        }

        if (milestone === 'start') {
          // Milestone 1: Trần Minh Khôi & Nguyễn Lan Anh already submitted; Bùi Hà My has NOT submitted yet
          const startSubmissions: Record<string, StudentSubmission> = {
            'sub-tran-minh-khoi': INITIAL_SUBMISSIONS['sub-tran-minh-khoi'],
            'sub-nguyen-lan-anh': INITIAL_SUBMISSIONS['sub-nguyen-lan-anh'],
          };
          set({
            demoMilestone: 'start',
            isAiResponding: false,
            submittedAssignmentIds: [],
            submissions: startSubmissions,
            assignments: [
              {
                ...CENTRAL_ASSIGNMENT,
                totalSubmissions: 2,
                assessedSubmissions: 2,
              },
            ],
            uploadedPages: [],
            outline: INITIAL_OUTLINE,
            socraticMessages: INITIAL_SOCRATIC_MESSAGES,
          });
        } else {
          // Milestone 2: Complete view with all 3 students submitted & graded
          set({
            demoMilestone: 'complete',
            isAiResponding: false,
            submittedAssignmentIds: [CENTRAL_ASSIGNMENT_ID],
            submissions: { ...INITIAL_SUBMISSIONS },
            assignments: [
              {
                ...CENTRAL_ASSIGNMENT,
                totalSubmissions: 3,
                assessedSubmissions: 3,
              },
            ],
            uploadedPages: INITIAL_SUBMISSIONS['sub-bui-ha-my'].pages,
          });
        }
      },

      resetDemoState: () => {
        if (activeAiResponseTimeout) {
          clearTimeout(activeAiResponseTimeout);
          activeAiResponseTimeout = null;
        }
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('edulit-app-v1');
          localStorage.removeItem('edulit-app-v1');
        }

        // Return to milestone 'start'
        const startSubmissions: Record<string, StudentSubmission> = {
          'sub-tran-minh-khoi': INITIAL_SUBMISSIONS['sub-tran-minh-khoi'],
          'sub-nguyen-lan-anh': INITIAL_SUBMISSIONS['sub-nguyen-lan-anh'],
        };

        const currentRole = get().currentUser?.role || 'teacher';
        set({
          currentUser: currentRole === 'student' ? DEMO_STUDENTS[0] : DEMO_TEACHER,
          demoMilestone: 'start',
          isAiResponding: false,
          assignments: [
            {
              ...CENTRAL_ASSIGNMENT,
              totalSubmissions: 2,
              assessedSubmissions: 2,
            },
          ],
          activeAssignmentId: CENTRAL_ASSIGNMENT_ID,
          activeRubric: RUBRIC_MAU_TU_DO_DAT,
          rubrics: AVAILABLE_RUBRICS,
          materials: MATERIALS_MAU_TU_DO_DAT,
          submissions: startSubmissions,
          submittedAssignmentIds: [],
          outline: INITIAL_OUTLINE,
          socraticMessages: INITIAL_SOCRATIC_MESSAGES,
          uploadedPages: [],
          ocrStatus: 'needs_review',
          flaggedSegments: [
            {
              lineRef: 8,
              text: 'tôi hít thở mầu tự do của đất',
              note: 'Từ "mầu": rà soát đối chiếu bản in gốc (màu vs mầu)',
              isCorrected: false,
            },
          ],
        });
      },

      // Assignments & Materials
      assignments: [
        {
          ...CENTRAL_ASSIGNMENT,
          totalSubmissions: 2,
          assessedSubmissions: 2,
        },
      ],
      activeAssignmentId: CENTRAL_ASSIGNMENT_ID,
      activeRubric: RUBRIC_MAU_TU_DO_DAT,
      rubrics: AVAILABLE_RUBRICS,
      materials: MATERIALS_MAU_TU_DO_DAT,

      updateRubricCriterion: (criterionId, updates) => {
        set((state) => {
          const updatedActive = {
            ...state.activeRubric,
            criteria: state.activeRubric.criteria.map((c) =>
              c.id === criterionId ? { ...c, ...updates } : c
            ),
          };
          return {
            activeRubric: updatedActive,
            rubrics: state.rubrics.map((r) =>
              r.id === updatedActive.id ? updatedActive : r
            ),
          };
        });
      },

      selectAssignmentRubric: (assignmentId, rubricId) => {
        const targetRubric = get().rubrics.find((r) => r.id === rubricId) || RUBRIC_MAU_TU_DO_DAT;
        set((state) => ({
          activeRubric: targetRubric,
          assignments: state.assignments.map((a) =>
            a.id === assignmentId ? { ...a, rubricId } : a
          ),
        }));
      },

      setActiveRubricById: (rubricId) => {
        const targetRubric = get().rubrics.find((r) => r.id === rubricId) || RUBRIC_MAU_TU_DO_DAT;
        set({ activeRubric: targetRubric });
      },

      publishAssignment: (id, updates) => {
        set((state) => ({
          assignments: state.assignments.map((a) =>
            a.id === id ? { ...a, status: 'published', statusLabel: 'Đã giao', ...updates } : a
          ),
        }));
      },

      addMaterial: (materialData) => {
        const newId = `mat-${Date.now()}`;
        const newMat: Material = {
          ...materialData,
          id: newId,
          version: 'v1.0',
          uploadedAt:
            'Hôm nay ' +
            new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };
        set((state) => ({ materials: [newMat, ...state.materials] }));
      },

      // Submissions
      submissions: {
        'sub-tran-minh-khoi': INITIAL_SUBMISSIONS['sub-tran-minh-khoi'],
        'sub-nguyen-lan-anh': INITIAL_SUBMISSIONS['sub-nguyen-lan-anh'],
      },
      submittedAssignmentIds: [],

      getStudentSubmission: (assignmentId: string, studentId: string) => {
        const list = Object.values(get().submissions);
        return list.find(
          (sub) => sub.assignmentId === assignmentId && sub.studentId === studentId
        );
      },

      updateStudentGrading: (submissionId, updates) => {
        set((state) => {
          const current = state.submissions[submissionId];
          if (!current) return state;

          let newEvals = current.evaluations;
          let newTotal = current.totalScore;

          if (updates.evaluations) {
            newEvals = updates.evaluations;
            newTotal = Number(
              newEvals.reduce((sum, item) => sum + (Number(item.awardedScore) || 0), 0).toFixed(2)
            );
          }

          const newScale10 = Number(((newTotal / 4.0) * 10).toFixed(2));

          return {
            submissions: {
              ...state.submissions,
              [submissionId]: {
                ...current,
                evaluations: newEvals,
                totalScore: newTotal,
                scoreScale10: newScale10,
                teacherNotes: updates.teacherNotes ?? current.teacherNotes,
              },
            },
          };
        });
      },

      publishStudentResult: (submissionId) => {
        set((state) => {
          const current = state.submissions[submissionId];
          if (!current) return state;
          return {
            submissions: {
              ...state.submissions,
              [submissionId]: {
                ...current,
                isPublishedToStudent: true,
              },
            },
          };
        });
      },

      // Outline
      outline: INITIAL_OUTLINE,

      addOutlinePoint: (sectionId, point) => {
        const cleanPoint = point.trim();
        if (!cleanPoint) return false;

        let added = false;
        set((state) => {
          const section = state.outline.find((s) => s.id === sectionId);
          if (!section) return state;

          // Duplicate check
          const alreadyExists = section.points.some(
            (p) => p.toLowerCase().trim() === cleanPoint.toLowerCase()
          );
          if (alreadyExists) {
            return state;
          }

          added = true;
          return {
            outline: state.outline.map((sec) =>
              sec.id === sectionId ? { ...sec, points: [...sec.points, cleanPoint] } : sec
            ),
          };
        });

        return added;
      },

      updateOutlinePoint: (sectionId, index, point) => {
        set((state) => ({
          outline: state.outline.map((sec) => {
            if (sec.id !== sectionId) return sec;
            const newPoints = [...sec.points];
            newPoints[index] = point.trim();
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

      reorderOutlinePoints: (sectionId, fromIndex, toIndex) => {
        set((state) => ({
          outline: state.outline.map((sec) => {
            if (sec.id !== sectionId) return sec;
            const newPoints = [...sec.points];
            const [moved] = newPoints.splice(fromIndex, 1);
            newPoints.splice(toIndex, 0, moved);
            return { ...sec, points: newPoints };
          }),
        }));
      },

      // Socratic Chat
      socraticMessages: INITIAL_SOCRATIC_MESSAGES,
      isAiResponding: false,

      sendSocraticMessage: (userText: string) => {
        const trimmed = userText.trim();
        if (!trimmed || get().isAiResponding) return;

        const userMsg: SocraticMessage = {
          id: `msg-${Date.now()}`,
          sender: 'user',
          text: trimmed,
          timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
        };

        set((state) => ({
          socraticMessages: [...state.socraticMessages, userMsg],
          isAiResponding: true,
        }));

        const matchedBranch = matchSocraticBranch(trimmed);

        if (activeAiResponseTimeout) {
          clearTimeout(activeAiResponseTimeout);
        }

        activeAiResponseTimeout = setTimeout(() => {
          let aiText = '';
          let canAdd = false;
          let outlinePoint: string | undefined = undefined;
          let suggestedSectionId: 'intro' | 'body' | 'conclusion' | undefined = undefined;
          let requirementTag: string | undefined = undefined;
          let branchId: string | undefined = undefined;

          if (matchedBranch) {
            aiText = matchedBranch.aiResponse;
            canAdd = !matchedBranch.isRefusal && Boolean(matchedBranch.outlinePoint);
            outlinePoint = matchedBranch.outlinePoint;
            suggestedSectionId = matchedBranch.defaultSectionId;
            requirementTag = matchedBranch.requirementTag;
            branchId = matchedBranch.id;
          } else {
            aiText = FALLBACK_RESPONSE.aiResponse;
            canAdd = false;
          }

          const aiMsg: SocraticMessage = {
            id: `msg-${Date.now() + 1}`,
            sender: 'ai',
            text: aiText,
            timestamp: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
            canAddToOutline: canAdd,
            outlinePoint,
            suggestedSectionId,
            requirementTag,
            branchId,
          };

          set((state) => ({
            socraticMessages: [...state.socraticMessages, aiMsg],
            isAiResponding: false,
          }));
          activeAiResponseTimeout = null;
        }, 750);
      },

      // Uploaded Pages
      uploadedPages: [],

      loadDemoBuiHaMyPages: () => {
        const manifest = SUBMISSION_MANIFEST['user-student-48'];
        if (manifest) {
          const pages: SubmissionPageImage[] = manifest.pages.map((p) => ({
            pageIndex: p.pageIndex,
            imageUrl: p.localPath,
            size: p.size,
            caption: p.caption,
            isCustomUpload: false,
          }));
          set({ uploadedPages: pages });
        }
      },

      addCustomUploadedPage: (page) => {
        set((state) => {
          const nextIndex = state.uploadedPages.length + 1;
          const newPage = { ...page, pageIndex: nextIndex, isCustomUpload: true };
          return { uploadedPages: [...state.uploadedPages, newPage] };
        });
      },

      removeUploadedPage: (pageIndex) => {
        set((state) => {
          const filtered = state.uploadedPages.filter((p) => p.pageIndex !== pageIndex);
          const reindexed = filtered.map((p, idx) => ({ ...p, pageIndex: idx + 1 }));
          return { uploadedPages: reindexed };
        });
      },

      reorderUploadedPages: (fromIndex, toIndex) => {
        set((state) => {
          const list = [...state.uploadedPages];
          const [moved] = list.splice(fromIndex, 1);
          list.splice(toIndex, 0, moved);
          const reindexed = list.map((p, idx) => ({ ...p, pageIndex: idx + 1 }));
          return { uploadedPages: reindexed };
        });
      },

      submitHandwrittenEssay: (assignmentId) => {
        const { uploadedPages, submissions, currentUser } = get();
        const studentId = currentUser.id;
        const studentName = currentUser.name;
        const studentCode = currentUser.code || 'VN-12A1-048';
        const submissionId = `sub-${studentId === 'user-student-48' ? 'bui-ha-my' : studentId}`;

        const defaultManifest =
          SUBMISSION_MANIFEST[studentId] || SUBMISSION_MANIFEST['user-student-48'];
        const baseSub =
          INITIAL_SUBMISSIONS[submissionId] || INITIAL_SUBMISSIONS['sub-bui-ha-my'];

        const newSub: StudentSubmission = {
          ...baseSub,
          id: submissionId,
          assignmentId,
          studentId,
          studentName,
          studentCode,
          submissionDate:
            'Hôm nay ' +
            new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
          status: 'submitted',
          pages: uploadedPages,
          transcriptionByPage: defaultManifest.transcriptionByPage,
          isPublishedToStudent: false, // Wait for teacher to publish in demo flow
        };

        set((state) => ({
          submissions: {
            ...state.submissions,
            [submissionId]: newSub,
          },
          submittedAssignmentIds: state.submittedAssignmentIds.includes(assignmentId)
            ? state.submittedAssignmentIds
            : [...state.submittedAssignmentIds, assignmentId],
          assignments: state.assignments.map((a) =>
            a.id === assignmentId
              ? {
                  ...a,
                  totalSubmissions: Object.keys({ ...state.submissions, [submissionId]: newSub }).length,
                  assessedSubmissions: Object.keys({ ...state.submissions, [submissionId]: newSub }).length,
                }
              : a
          ),
        }));
      },

      // OCR Verification
      ocrStatus: 'needs_review',
      setOcrStatus: (status) => set({ ocrStatus: status }),
      flaggedSegments: [
        {
          lineRef: 8,
          text: 'tôi hít thở mầu tự do của đất',
          note: 'Từ "mầu": rà soát đối chiếu bản in gốc (màu vs mầu)',
          isCorrected: false,
        },
      ],
      correctFlaggedSegment: (lineRef, newText) => {
        set((state) => ({
          flaggedSegments: state.flaggedSegments.map((seg) =>
            seg.lineRef === lineRef ? { ...seg, text: newText, isCorrected: true } : seg
          ),
        }));
      },

      updateTranscriptionLine: (submissionId, pageIndex, lineIndex, newText) => {
        set((state) => {
          const current = state.submissions[submissionId];
          if (!current) return state;

          const updatedTranscription = current.transcriptionByPage.map((p) => {
            if (p.pageIndex !== pageIndex) return p;
            const updatedLines = [...p.lines];
            updatedLines[lineIndex] = newText;
            return { ...p, lines: updatedLines };
          });

          return {
            submissions: {
              ...state.submissions,
              [submissionId]: {
                ...current,
                transcriptionByPage: updatedTranscription,
              },
            },
          };
        });
      },
    }),
    {
      name: 'edulit-app-v1',
      storage: createJSONStorage(() => ({
        getItem: (key: string) => {
          if (typeof window === 'undefined') return null;
          try {
            return sessionStorage.getItem(key);
          } catch {
            return null;
          }
        },
        setItem: (key: string, value: string) => {
          if (typeof window === 'undefined') return;
          try {
            sessionStorage.setItem(key, value);
          } catch (err) {
            console.warn('[EduLit] sessionStorage quota exceeded, keeping state in RAM:', err);
          }
        },
        removeItem: (key: string) => {
          if (typeof window === 'undefined') return;
          try {
            sessionStorage.removeItem(key);
          } catch {}
        },
      })),
      partialize: (state) => ({
        currentUser: state.currentUser,
        sidebarCollapsed: state.sidebarCollapsed,
        demoMilestone: state.demoMilestone,
        assignments: state.assignments,
        activeAssignmentId: state.activeAssignmentId,
        submittedAssignmentIds: state.submittedAssignmentIds,
        outline: state.outline,
        socraticMessages: state.socraticMessages,
        ocrStatus: state.ocrStatus,
        flaggedSegments: state.flaggedSegments,
        // Strip out gigantic raw base64 data URLs from storage to guarantee 0 quota overflow
        uploadedPages: state.uploadedPages.map((p) => ({
          ...p,
          imageUrl: p.imageUrl.startsWith('data:') ? '' : p.imageUrl,
        })),
        submissions: Object.fromEntries(
          Object.entries(state.submissions).map(([id, sub]) => [
            id,
            {
              ...sub,
              pages: sub.pages.map((p) => ({
                ...p,
                imageUrl: p.imageUrl.startsWith('data:') ? '' : p.imageUrl,
              })),
            },
          ])
        ),
      }),
    }
  )
);

if (typeof window !== 'undefined') {
  (window as unknown as { resetEduLit?: (role?: 'teacher' | 'student') => void }).resetEduLit = (role) => {
    if (role) {
      useAppStore.getState().setRole(role);
    }
    useAppStore.getState().resetDemoState();
    window.location.reload();
  };
}
