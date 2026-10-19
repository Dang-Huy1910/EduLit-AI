from __future__ import annotations

import argparse
import asyncio
import logging
import sys
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import LOCAL_PROTOTYPE_TEACHER_PASSWORD, Settings, get_settings
from app.core.http import utcnow
from app.core.passwords import hash_password
from app.db.models import AuthSession, AuthToken, RateLimitBucket, User, UserRole, UserStatus
from app.identity.domain import normalize_email, normalize_login_id

logger = logging.getLogger("edulit.cli")


def _session_factory(settings: Settings) -> async_sessionmaker[AsyncSession]:
    engine = create_async_engine(settings.async_database_url, pool_pre_ping=True)
    return async_sessionmaker(engine, expire_on_commit=False)


async def bootstrap_teacher(settings: Settings, *, reset_password: bool = False) -> None:
    login_id = normalize_login_id(settings.BOOTSTRAP_TEACHER_LOGIN_ID)
    email = normalize_email(settings.BOOTSTRAP_TEACHER_EMAIL)
    display_name = settings.BOOTSTRAP_TEACHER_DISPLAY_NAME.strip() or "Cô Đặng Loan"
    password = settings.BOOTSTRAP_TEACHER_PASSWORD or LOCAL_PROTOTYPE_TEACHER_PASSWORD
    if settings.is_production and password == LOCAL_PROTOTYPE_TEACHER_PASSWORD:
        raise SystemExit("Production rejects the prototype teacher password.")

    factory = _session_factory(settings)
    async with factory() as session:
        result = await session.execute(select(User).where(User.login_id == login_id))
        existing = result.scalar_one_or_none()
        if existing is None:
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
            await session.commit()
            print(f"Created teacher {login_id} <{email}> (operator-provisioned, marked verified).")
            return

        changed = False
        if existing.role != UserRole.TEACHER:
            existing.role = UserRole.TEACHER
            changed = True
        if existing.email_verified_at is None:
            existing.email_verified_at = utcnow()
            changed = True
        if existing.status != UserStatus.ACTIVE:
            existing.status = UserStatus.ACTIVE
            changed = True
        if reset_password:
            existing.password_hash = await hash_password(password)
            existing.credentials_version = existing.credentials_version + 1
            existing.updated_at = utcnow()
            await session.execute(
                AuthSession.__table__.update()
                .where(AuthSession.user_id == existing.id, AuthSession.revoked_at.is_(None))
                .values(revoked_at=utcnow())
            )
            changed = True
            print(f"Reset password for teacher {login_id}. Existing sessions revoked.")
        if changed:
            await session.commit()
            print(f"Teacher {login_id} already existed; applied operator-safe updates only.")
        else:
            await session.rollback()
            print(f"Teacher {login_id} already exists; password and UUID left unchanged.")


async def cleanup_expired(settings: Settings) -> None:
    factory = _session_factory(settings)
    now = utcnow()
    cutoff = now - timedelta(days=7)
    async with factory() as session:
        sessions = await session.execute(
            delete(AuthSession).where(
                (AuthSession.expires_at < now) | (AuthSession.revoked_at.is_not(None) & (AuthSession.revoked_at < cutoff))
            )
        )
        tokens = await session.execute(
            delete(AuthToken).where(
                (AuthToken.expires_at < now)
                | (AuthToken.used_at.is_not(None) & (AuthToken.used_at < cutoff))
                | (AuthToken.revoked_at.is_not(None) & (AuthToken.revoked_at < cutoff))
            )
        )
        buckets = await session.execute(delete(RateLimitBucket).where(RateLimitBucket.reset_at < now))
        await session.commit()
        print(
            f"Cleanup removed sessions={sessions.rowcount} tokens={tokens.rowcount} "
            f"rate_limit_buckets={buckets.rowcount}"
        )


async def seed_demo(settings: Settings) -> None:
    from app.db.models.socratic import AssignmentRevision

    factory = _session_factory(settings)
    async with factory() as session:
        # 1. Bootstrap teacher
        await bootstrap_teacher(settings, reset_password=False)

        # 2. Seed student
        student_login = "nguyen.van.an"
        student_email = "nguyen.van.an@thptdanphuong.edu.vn"
        student_pw = "HocSinh@2024"
        res = await session.execute(select(User).where(User.login_id == student_login))
        student = res.scalar_one_or_none()
        if student is None:
            student = User(
                login_id=student_login,
                email=student_email,
                display_name="Nguyễn Văn An (12A1)",
                password_hash=await hash_password(student_pw),
                role=UserRole.STUDENT,
                status=UserStatus.ACTIVE,
                email_verified_at=utcnow(),
            )
            session.add(student)
            print(f"Created student {student_login} <{student_email}> / password: {student_pw}")
        else:
            student.email_verified_at = student.email_verified_at or utcnow()
            student.status = UserStatus.ACTIVE
            student.role = UserRole.STUDENT
            print(f"Student {student_login} already exists; updated active/verified status.")

        # 3. Seed assignment
        code = "VAN12-NLXH-SOC"
        res = await session.execute(
            select(AssignmentRevision).where(AssignmentRevision.code == code)
        )
        assignment = res.scalar_one_or_none()
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
                        "id": "chunk-1",
                        "title": "Bản lĩnh trong kỷ nguyên số",
                        "text": "Thời đại công nghệ số mang đến cơ hội tiếp cận tri thức vô tận nhưng cũng đi kèm nguy cơ phân tâm, mất định hướng và áp lực đồng trang lứa trên mạng xã hội.",
                    },
                    {
                        "id": "chunk-2",
                        "title": "Tự chủ tư duy và đạo đức công nghệ",
                        "text": "Bản lĩnh của người trẻ không chỉ là dám dấn thân mà còn là biết chọn lọc thông tin, giữ vững giá trị nhân văn và không bị lệ thuộc vào thuật toán hay ý kiến đám đông.",
                    },
                ],
            )
            session.add(assignment)
            print(f"Created assignment {code}: {assignment.title}")
        else:
            assignment.status = "PUBLISHED"
            print(f"Assignment {code} already exists; status set to PUBLISHED.")

        await session.commit()
        print("Seed demo data successfully completed!")


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser(prog="edulit-auth")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("bootstrap-teacher", help="Create the prototype teacher if missing (idempotent).")
    reset = sub.add_parser(
        "reset-teacher-password",
        help="Operator-only: set teacher password from BOOTSTRAP_TEACHER_PASSWORD and revoke sessions.",
    )
    reset.add_argument("--i-understand", action="store_true", required=True)
    sub.add_parser("cleanup-expired", help="Delete expired sessions, tokens, and rate-limit buckets.")
    sub.add_parser("seed-demo", help="Seed demo teacher, student (nguyen.van.an), and assignment (VAN12-NLXH-SOC).")
    sub.add_parser(
        "outline-prep-worker",
        help="Run the durable per-student outline-prep worker (resumes queued jobs after restart).",
    )
    sub.add_parser(
        "ocr-worker",
        help="Run the durable OCR worker (resumes queued handwritten pages after restart).",
    )
    args = parser.parse_args(argv)
    settings = get_settings()

    if args.command == "bootstrap-teacher":
        asyncio.run(bootstrap_teacher(settings, reset_password=False))
    elif args.command == "reset-teacher-password":
        asyncio.run(bootstrap_teacher(settings, reset_password=True))
    elif args.command == "cleanup-expired":
        asyncio.run(cleanup_expired(settings))
    elif args.command == "seed-demo":
        asyncio.run(seed_demo(settings))
    elif args.command == "outline-prep-worker":
        from app.workers.outline_prep import run_outline_prep_worker

        asyncio.run(run_outline_prep_worker(settings=settings))
    elif args.command == "ocr-worker":
        from app.workers.ocr import run_ocr_worker

        asyncio.run(run_ocr_worker(settings=settings))
    else:
        parser.error("unknown command")


if __name__ == "__main__":
    main(sys.argv[1:])
