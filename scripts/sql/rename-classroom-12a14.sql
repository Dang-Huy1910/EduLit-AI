-- Run in the Neon SQL Editor for the application's database.
-- Keep the classroom ID so memberships and assignments remain linked.
BEGIN;

UPDATE classrooms AS c
SET code = '12A14',
    name = 'Lớp 12A14',
    grade_level = 12,
    academic_year = '2026-2027',
    updated_at = NOW()
FROM users AS u
WHERE c.owner_teacher_id = u.id
  AND u.login_id = 'dang.loan'
  AND c.code = '11A14'
RETURNING c.id, c.code, c.name, c.grade_level, c.academic_year;

COMMIT;
