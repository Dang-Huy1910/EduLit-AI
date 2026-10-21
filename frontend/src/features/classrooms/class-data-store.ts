'use client';

import type { ClassroomSummary, StudentClassroom } from '@/features/catalog/types';
import { classroomsApi, studentClassroomsApi } from './api';
import { createClassDataStore } from './class-data-store-factory';

export { createClassDataStore } from './class-data-store-factory';

const fetchTerms = () => classroomsApi.listTerms();

export const useClassDataStore = createClassDataStore<ClassroomSummary>(
  (termId) => classroomsApi.listTeacherClassrooms({ termId }),
  { filter: (classroom) => !classroom.archived, fetchTerms }
);

export const useStudentClassDataStore = createClassDataStore<StudentClassroom>(
  (termId) => studentClassroomsApi.listMine({ termId }),
  { fetchTerms }
);
