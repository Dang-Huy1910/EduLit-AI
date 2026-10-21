import type { ClassroomSummary, Term } from '@/features/catalog/types';

export function pickDefaultTerm(terms: Term[]): Term | undefined {
  const current = terms.find((term) => term.isCurrent);
  if (current) return current;
  return [...terms].sort((a, b) => {
    const byStart = new Date(b.startsOn).getTime() - new Date(a.startsOn).getTime();
    return Number.isNaN(byStart) ? b.academicYear.localeCompare(a.academicYear) : byStart;
  })[0];
}

export function pickDefaultClassroom(
  classrooms: ClassroomSummary[],
  preferredId?: string
): ClassroomSummary | undefined {
  return (
    classrooms.find((classroom) => classroom.id === preferredId) ||
    classrooms.find((classroom) => !classroom.readOnly) ||
    classrooms[0]
  );
}

export function termLabel(term: Term): string {
  return `${term.name} • ${term.academicYear}`;
}

export function classroomLabel(classroom: ClassroomSummary): string {
  return `${classroom.code} • ${classroom.subject}`;
}

export function normalizeJoinCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[\s-]+/g, '');
}

export function shouldResetClassContext(storedUserId: string, currentUserId: string | undefined): boolean {
  return Boolean(currentUserId && currentUserId !== storedUserId);
}
