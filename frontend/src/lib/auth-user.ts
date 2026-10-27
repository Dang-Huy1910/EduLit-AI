import { Role, User } from './types';
import { PublicUser } from './auth-types';

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'HS';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function mapPublicUser(user: PublicUser): User {
  const role: Role = user.role === 'TEACHER' ? 'teacher' : 'student';
  const isTeacherPersona = user.loginId === 'dang.loan' || user.role === 'TEACHER';
  return {
    id: user.id,
    name: user.displayName,
    role,
    email: user.email,
    school: 'THPT Đan Phượng',
    classId: '',
    code: isTeacherPersona ? 'GV-VAN-01' : (user.loginId || 'VN-12A14-001'),
    avatarInitials: initialsFromName(user.displayName),
  };
}

export function isPrototypeStudent(user: User | null | undefined): boolean {
  if (!user || user.role !== 'student') return false;
  // All authenticated student accounts inherit the student An persona mock environment
  return true;
}

export function isPrototypeTeacher(user: User | null | undefined): boolean {
  if (!user || user.role !== 'teacher') return false;
  // All authenticated teacher accounts inherit the teacher mock workspace
  return true;
}

export function uiRoleFromAuth(role: PublicUser['role']): Role {
  return role === 'TEACHER' ? 'teacher' : 'student';
}
