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


async def seed_assignment_nlvh(session: AsyncSession) -> AssignmentRevision:
    code = "VAN11-NLVH-01"
    result = await session.execute(
        select(AssignmentRevision).where(AssignmentRevision.code == code)
    )
    assignment = result.scalar_one_or_none()
    if assignment is None:
        assignment = AssignmentRevision(
            code=code,
            title='Phân tích "Màu tự do của đất" — Trần Quang Quý',
            genre="NLVH",
            status="PUBLISHED",
            instructions={
                "topic": 'Cảm nhận "tự do" qua hình ảnh làng quê trong bài thơ "Màu tự do của đất"',
                "genre": "Nghị luận văn học",
                "word_count_target": "khoảng 600 chữ",
                "requirements": [
                    "Mở bài: Đặt bài thơ Màu tự do của đất của Trần Quang Quý vào đúng vấn đề nghị luận.",
                    "Thân bài: Phân tích hình ảnh làng quê qua khứu giác, cảm giác và cội rễ tâm thức làng; làm rõ nghịch lí tự do không thoát ly bùn đất; nghệ thuật chuỗi buộc-neo-cởi; liên hệ tác phẩm khác.",
                    "Kết bài: Khái quát đóng góp của hình ảnh làng quê và khẳng định cách nhìn riêng của tác giả về tự do.",
                ],
            },
            rubric={
                "criteria": [
                    {
                        "id": "C1_CONTENT_ART_RELATION",
                        "name": "Nội dung, nghệ thuật và liên hệ",
                        "weight": 2.5,
                        "description": "Phân tích cách cảm nhận tự do qua hình ảnh làng quê; làm rõ nghịch lí tự do không thoát ly bùn đất; nghệ thuật thơ tự do suy tưởng; liên hệ tác phẩm khác làm bật nét riêng của tác giả.",
                    },
                    {
                        "id": "C2_ANALYSIS_ARGUMENT",
                        "name": "Phân tích, lập luận và sử dụng dẫn chứng",
                        "weight": 0.75,
                        "description": "Lập luận mạch lạc, bám sát văn bản; trích dẫn dẫn chứng thơ chính xác, phát hiện và phân tích được các tín hiệu thẩm mỹ độc đáo.",
                    },
                    {
                        "id": "C3_EXPRESSION_LANGUAGE",
                        "name": "Diễn đạt, ngôn ngữ và chính tả",
                        "weight": 0.5,
                        "description": "Diễn đạt trong sáng, giàu hình ảnh và cảm xúc văn học; không mắc lỗi chính tả, dùng từ, ngữ pháp.",
                    },
                    {
                        "id": "C4_STRUCTURE_PRESENTATION",
                        "name": "Bố cục và hình thức bài viết",
                        "weight": 0.25,
                        "description": "Bố cục đủ 3 phần Mở bài - Thân bài - Kết bài rõ ràng, chuyển ý tự nhiên; trình bày sạch đẹp.",
                    },
                ]
            },
            context_chunks=[
                {
                    "chunk_id": "chunk-poem-mau-tu-do-dat",
                    "title": "Bài thơ Màu tự do của đất (Trần Quang Quý)",
                    "text": (
                        "Những ngọn khói cay mùi rơm rạ dắt tôi về cánh đồng lồng lộng sao đêm\n"
                        "tôi hít thở mầu tự do của đất\n"
                        "ngọn khói buộc thân phận nông dân vào cây cột tâm thức làng\n"
                        "và mái đình cong câu ngược tầm nhìn\n"
                        "những ngõ xóm ngủ hiền trên ngõ\n"
                        "mỗi buổi sáng một ban mai mọc trong họ tiếng hạt nảy mầm…\n\n"
                        "Còn vẳng lên bầy châu chấu bò quanh ký ức quê làng\n"
                        "nức thơm mùa hái gặt\n"
                        "củ khoai lùi bong ra cơn đói\n"
                        "dẫn ngược con đường in dấu vết thuở ông bà mở đất\n"
                        "những giần sàng gạn lấy nhân sinh\n\n"
                        "Liềm hái thèm ngày thôi gặt gió sương\n"
                        "người nông dân thèm tự do được giải phóng mình khỏi nhọc nhằn cơ bắp\n"
                        "và tự do đầu tiên lại là tự do không thoát ly bùn đất\n"
                        "tự do của mồ hôi\n"
                        "tự do neo đời mình vào cánh đồng sương gió\n\n"
                        "Trong trùng điệp bóng quê, trong trùng điệp gót người xa khuất\n"
                        "sợi tóc làng rụng xuống ca dao\n"
                        "áo rách áo lành bọc được bao nhiêu nhân nghĩa\n"
                        "chiếc áo làng tôi, chiếc áo đã vị bùn\n"
                        "ai cởi cho ta mùi khói cơm thơm?\n\n"
                        "26/10/2010\n"
                        "('Màu tự do của đất', in trong tập thơ cùng tên, NXB Hội Nhà văn)"
                    ),
                },
                {
                    "chunk_id": "chunk-barem-docx-huong-dan-cham",
                    "title": "Hướng dẫn chấm gốc DOCX",
                    "text": (
                        "Bài văn tập trung vào cách Trần Quang Quý cảm nhận 'tự do' qua hình ảnh làng quê, "
                        "đánh giá được nét đặc sắc nội dung, nghệ thuật và có một văn bản liên hệ về làng quê, đồng ruộng. "
                        "Dung lượng khoảng 600 chữ; chứng cứ chủ yếu lấy từ chính bài thơ. "
                        "Nghịch lí trung tâm: người nông dân thèm giải phóng mình khỏi nhọc nhằn cơ bắp nhưng tự do đầu tiên lại là tự do không thoát ly bùn đất. "
                        "Chuỗi động từ: buộc - neo - cởi. Điệp từ tự do."
                    ),
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
        assignment_soc = await seed_assignment(session)
        assignment_nlvh = await seed_assignment_nlvh(session)
        await seed_access(session, student, assignment_soc)
        await seed_access(session, student, assignment_nlvh)
        await session.commit()
    logger.info("Seed demo completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())

