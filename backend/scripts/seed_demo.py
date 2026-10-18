"""Seed demo data for EduLit-AI Socratic testing.

Creates:
1. Teacher account: dang.loan / DanPhuong@2024
2. Student account: nguyen.van.an / HocSinh@2024
3. Published assignment: VAN12-NLXH-SOC
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import LOCAL_PROTOTYPE_TEACHER_PASSWORD, Settings, get_settings
from app.core.http import utcnow
from app.core.passwords import hash_password
from app.db.models import User, UserRole, UserStatus
from app.db.models.socratic import AssignmentAccess, AssignmentRevision
from app.db.session import get_session_factory
from app.identity.domain import normalize_email, normalize_login_id

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("seed_demo")


async def seed_teacher(session: AsyncSession, settings: Settings) -> User:
    login_id = normalize_login_id(settings.BOOTSTRAP_TEACHER_LOGIN_ID)
    email = normalize_email(settings.BOOTSTRAP_TEACHER_EMAIL)
    display_name = settings.BOOTSTRAP_TEACHER_DISPLAY_NAME.strip() or "Cô Đặng Loan"
    password = settings.BOOTSTRAP_TEACHER_PASSWORD or LOCAL_PROTOTYPE_TEACHER_PASSWORD

    result = await session.execute(select(User).where(User.login_id == login_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            login_id=login_id,
            email=email,
            display_name=display_name,
            password_hash=await hash_password(password),
            role=UserRole.TEACHER,
            status=UserStatus.ACTIVE,
            email_verified_at=utcnow(),
        )
        session.add(user)
        logger.info("Created teacher: %s (%s)", login_id, email)
    else:
        user.email_verified_at = user.email_verified_at or utcnow()
        user.status = UserStatus.ACTIVE
        user.role = UserRole.TEACHER
        logger.info("Teacher already exists: %s", login_id)
    return user


async def seed_student(session: AsyncSession) -> User:
    login_id = "nguyen.van.an"
    email = "nguyen.van.an@thptdanphuong.edu.vn"
    display_name = "Nguyễn Văn An (12A1)"
    password = "HocSinh@2024"

    result = await session.execute(select(User).where(User.login_id == login_id))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            login_id=login_id,
            email=email,
            display_name=display_name,
            password_hash=await hash_password(password),
            role=UserRole.STUDENT,
            status=UserStatus.ACTIVE,
            email_verified_at=utcnow(),
        )
        session.add(user)
        logger.info("Created student: %s (%s) / password: %s", login_id, email, password)
    else:
        user.email_verified_at = user.email_verified_at or utcnow()
        user.status = UserStatus.ACTIVE
        user.role = UserRole.STUDENT
        logger.info("Student already exists: %s", login_id)
    return user


async def seed_assignment(session: AsyncSession) -> AssignmentRevision:
    code = "VAN12-NLXH-SOC"
    result = await session.execute(
        select(AssignmentRevision).where(AssignmentRevision.code == code)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        assignment = AssignmentRevision(
            code=code,
            title="Nghị luận xã hội về bản lĩnh của người trẻ trong thời đại số",
            genre="NLXH",
            status="PUBLISHED",
            instructions={
                "topic": "Bàn về bản lĩnh của thế hệ trẻ khi đối mặt với thách thức và cơ hội trong kỷ nguyên số",
                "genre": "Nghị luận xã hội",
                "word_count_target": "khoảng 600 chữ",
                "requirements": [
                    "Xác định rõ vấn đề nghị luận và lập trường cá nhân",
                    "Triển khai ít nhất 2 luận điểm trọng tâm với dẫn chứng xác thực",
                    "Phản biện hoặc mở rộng góc nhìn",
                    "Rút ra bài học nhận thức và hành động thực tiễn",
                ],
            },
            rubric={
                "criteria": [
                    {
                        "id": "C1",
                        "name": "Xác định vấn đề",
                        "description": "Xác định đúng và trúng vấn đề nghị luận, thể hiện rõ quan điểm",
                    },
                    {
                        "id": "C2",
                        "name": "Hệ thống luận điểm",
                        "description": "Luận điểm rõ ràng, lập luận chặt chẽ, mạch lạc",
                    },
                    {
                        "id": "C3",
                        "name": "Dẫn chứng thực tế",
                        "description": "Dẫn chứng tiêu biểu, cập nhật, phân tích thuyết phục",
                    },
                    {
                        "id": "C4",
                        "name": "Bài học và hành động",
                        "description": "Rút ra bài học sâu sắc, có tính khả thi và định hướng tích cực",
                    },
                ]
            },
            context_chunks=[
                {
                    "chunk_id": "chunk-1",
                    "title": "Bản lĩnh trong kỷ nguyên số",
                    "text": "Thời đại công nghệ số mang đến cơ hội tiếp cận tri thức vô tận nhưng cũng đi kèm nguy cơ phân tâm, mất định hướng và áp lực đồng trang lứa trên mạng xã hội.",
                },
                {
                    "chunk_id": "chunk-2",
                    "title": "Tự chủ tư duy và đạo đức công nghệ",
                    "text": "Bản lĩnh của người trẻ không chỉ là dám dấn thân mà còn là biết chọn lọc thông tin, giữ vững giá trị nhân văn và không bị lệ thuộc vào thuật toán hay ý kiến đám đông.",
                },
            ],
            readiness_policy={
                "requiredContentKeys": ["thesis", "sections"],
                "minSections": 1,
            },
        )
        session.add(assignment)
        logger.info("Created assignment: %s - %s", code, assignment.title)
    else:
        assignment.status = "PUBLISHED"
        logger.info("Assignment already exists: %s", code)
    return assignment


async def seed_access(session: AsyncSession, student: User, assignment: AssignmentRevision) -> None:
    result = await session.execute(
        select(AssignmentAccess).where(
            AssignmentAccess.assignment_revision_id == assignment.id,
            AssignmentAccess.student_id == student.id,
        )
    )
    access = result.scalar_one_or_none()
    if access is None:
        session.add(
            AssignmentAccess(
                assignment_revision_id=assignment.id,
                student_id=student.id,
            )
        )
        logger.info("Granted assignment access: %s -> %s", student.login_id, assignment.code)
    elif access.revoked_at is not None:
        access.revoked_at = None
        logger.info("Restored assignment access: %s -> %s", student.login_id, assignment.code)
    else:
        logger.info("Assignment access already exists: %s -> %s", student.login_id, assignment.code)


async def main() -> None:
    settings = get_settings()
    if settings.is_production:
        raise SystemExit("Refusing to seed demo data when APP_ENV=production")
    factory = get_session_factory(settings)
    async with factory() as session:
        await seed_teacher(session, settings)
        student = await seed_student(session)
        assignment = await seed_assignment(session)
        await seed_access(session, student, assignment)
        await session.commit()
    logger.info("Seed demo completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())

