"""Seed demo data for EduLit-AI Socratic testing.

Creates:
1. Teacher account: dang.loan / 123456
2. Student account: nguyen.van.an / 123456 (lớp 11A14)
3. Student outside class: bui.hamy / 123456 (không nhận bài của 11A14)
4. Published legacy assignments: VAN12-NLXH-SOC, VAN11-NLVH-01
5. Catalog: chuyên đề, ngữ liệu, đề nguồn, barem, lớp 11A14
"""

from __future__ import annotations

import asyncio
import logging

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.http import utcnow
from app.core.passwords import hash_password
from app.db.models import (
    ClassMembership,
    Classroom,
    Material,
    MaterialChunk,
    MaterialVersion,
    Rubric,
    RubricVersion,
    SourcePrompt,
    SourcePromptMaterial,
    Topic,
    User,
    UserRole,
    UserStatus,
)
from app.db.models.socratic import AssignmentAccess, AssignmentRevision
from app.db.session import get_session_factory
from app.identity.domain import normalize_email, normalize_login_id

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("seed_demo")

DEMO_PASSWORD = "123456"


async def seed_teacher(session: AsyncSession, settings: Settings) -> User:
    login_id = normalize_login_id(settings.BOOTSTRAP_TEACHER_LOGIN_ID)
    email = normalize_email(settings.BOOTSTRAP_TEACHER_EMAIL)
    display_name = settings.BOOTSTRAP_TEACHER_DISPLAY_NAME.strip() or "Cô Đặng Loan"
    password = DEMO_PASSWORD

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
        user.password_hash = await hash_password(password)
        logger.info("Teacher already exists: %s", login_id)
    return user


async def seed_student(session: AsyncSession) -> User:
    login_id = "nguyen.van.an"
    email = "nguyen.van.an@thptdanphuong.edu.vn"
    display_name = "Nguyễn Văn An (12A1)"
    password = DEMO_PASSWORD

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
        user.password_hash = await hash_password(password)
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


async def seed_student_named(
    session: AsyncSession,
    *,
    login_id: str,
    email: str,
    display_name: str,
    password: str = DEMO_PASSWORD,
) -> User:
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
        logger.info("Created student: %s (%s)", login_id, email)
    else:
        user.email_verified_at = user.email_verified_at or utcnow()
        user.status = UserStatus.ACTIVE
        user.role = UserRole.STUDENT
        user.password_hash = await hash_password(password)
        logger.info("Student already exists: %s", login_id)
    return user


POEM_TEXT = (
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
)

FACTORY_SMOKE_TEXT = (
    "Buổi sáng thành phố mở mắt trong lớp sương xám của khói nhà máy. "
    "Ống khói đứng thẳng như những cây bút chì khổng lồ, viết lên trời những đường chữ không ai đọc nổi. "
    "Người đi làm cúi mặt, lấy khăn che miệng, bước vội qua con đường còn ẩm mùi xăng và bụi than.\n\n"
    "Khói nhà máy khác khói bếp: nó không gợi cơm chín hay lửa ấm, mà là dấu hiệu của nhịp sản xuất "
    "không nghỉ. Có người thấy ở đó sức sống công nghiệp, có người chỉ thấy lá phổi của phố bị buộc phải "
    "hít thở hộ nhà máy.\n\n"
    "Đứng giữa hai cách nhìn ấy, người viết cần chọn một lập trường: phát triển có được phép đổi bằng "
    "không khí trong lành của chính những người làm ra của cải đó hay không?"
)

RUBRIC_4D_CRITERIA = [
    {
        "id": "C1_CONTENT_ART_RELATION",
        "name": "Nội dung, nghệ thuật và liên hệ",
        "weight": 2.5,
        "guideNote": "Phân tích đúng yêu cầu nghị luận, bám sát ngữ liệu, có liên hệ phù hợp.",
    },
    {
        "id": "C2_ANALYSIS_ARGUMENT",
        "name": "Phân tích, lập luận và sử dụng dẫn chứng",
        "weight": 0.75,
        "guideNote": "Lập luận mạch lạc, dẫn chứng xác đáng lấy từ ngữ liệu được giao.",
    },
    {
        "id": "C3_EXPRESSION_LANGUAGE",
        "name": "Diễn đạt, ngôn ngữ và chính tả",
        "weight": 0.5,
        "guideNote": "Diễn đạt trong sáng, đúng ngữ pháp, hạn chế lỗi chính tả.",
    },
    {
        "id": "C4_STRUCTURE_PRESENTATION",
        "name": "Bố cục và hình thức bài viết",
        "weight": 0.25,
        "guideNote": "Đủ mở - thân - kết, dung lượng phù hợp yêu cầu đề.",
    },
]


async def _get_or_create_topic(session: AsyncSession, teacher: User, title: str, **kwargs) -> Topic:
    result = await session.execute(
        select(Topic).where(Topic.owner_teacher_id == teacher.id, Topic.title == title)
    )
    topic = result.scalar_one_or_none()
    if topic is None:
        topic = Topic(owner_teacher_id=teacher.id, title=title, **kwargs)
        session.add(topic)
        await session.flush()
        logger.info("Created topic: %s", title)
    return topic


async def _get_or_create_material(
    session: AsyncSession,
    teacher: User,
    *,
    title: str,
    author: str,
    source_info: str,
    content: str,
    topic: Topic | None,
    grade_level: int,
) -> Material:
    result = await session.execute(
        select(Material).where(Material.owner_teacher_id == teacher.id, Material.title == title)
    )
    material = result.scalar_one_or_none()
    if material is None:
        material = Material(
            owner_teacher_id=teacher.id,
            topic_id=topic.id if topic else None,
            title=title,
            author=author,
            source_info=source_info,
            grade_level=grade_level,
            status="READY",
        )
        session.add(material)
        await session.flush()
        version = MaterialVersion(
            material_id=material.id,
            version=1,
            content=content,
            source_notes=[source_info] if source_info else [],
            status="READY",
        )
        session.add(version)
        await session.flush()
        session.add(
            MaterialChunk(
                material_version_id=version.id,
                chunk_id="chunk-1",
                title=title,
                text=content,
                sort_order=1,
            )
        )
        logger.info("Created material: %s", title)
    return material


async def _get_or_create_prompt(
    session: AsyncSession,
    teacher: User,
    *,
    title: str,
    writing_task: str,
    genre: str,
    grade_level: int,
    topic: Topic | None,
    materials: list[Material],
) -> SourcePrompt:
    result = await session.execute(
        select(SourcePrompt).where(SourcePrompt.owner_teacher_id == teacher.id, SourcePrompt.title == title)
    )
    prompt = result.scalar_one_or_none()
    if prompt is None:
        prompt = SourcePrompt(
            owner_teacher_id=teacher.id,
            topic_id=topic.id if topic else None,
            title=title,
            writing_task=writing_task,
            extra_guidance="",
            genre=genre,
            grade_level=grade_level,
            status="READY",
        )
        session.add(prompt)
        await session.flush()
        for index, material in enumerate(materials):
            session.add(
                SourcePromptMaterial(
                    source_prompt_id=prompt.id,
                    material_id=material.id,
                    sort_order=index,
                )
            )
        logger.info("Created source prompt: %s", title)
    else:
        prompt.writing_task = writing_task
        prompt.status = "READY"
    return prompt


async def seed_classroom(session: AsyncSession, teacher: User, student: User) -> Classroom:
    result = await session.execute(
        select(Classroom).where(Classroom.owner_teacher_id == teacher.id, Classroom.code == "11A14")
    )
    classroom = result.scalar_one_or_none()
    if classroom is None:
        classroom = Classroom(
            owner_teacher_id=teacher.id,
            code="11A14",
            name="Lớp 11A14 • THPT Đan Phượng",
            grade_level=11,
            academic_year="2026-2027",
        )
        session.add(classroom)
        await session.flush()
        logger.info("Created classroom 11A14")
    for user, role in ((teacher, "TEACHER"), (student, "STUDENT")):
        existing = await session.execute(
            select(ClassMembership).where(
                ClassMembership.classroom_id == classroom.id,
                ClassMembership.user_id == user.id,
            )
        )
        if existing.scalar_one_or_none() is None:
            session.add(
                ClassMembership(
                    classroom_id=classroom.id,
                    user_id=user.id,
                    membership_role=role,
                    status="ACTIVE",
                )
            )
    return classroom


async def seed_catalog(session: AsyncSession, teacher: User) -> None:
    topic_village = await _get_or_create_topic(
        session,
        teacher,
        "Làng quê và cảm nhận tự do",
        description="Chuyên đề nghị luận văn học về hình ảnh làng quê.",
        grade_level=11,
        genre="NLVH",
        status="ACTIVE",
    )
    topic_urban = await _get_or_create_topic(
        session,
        teacher,
        "Đô thị, môi trường và trách nhiệm công dân",
        description="Chuyên đề nghị luận xã hội về không gian sống đô thị.",
        grade_level=11,
        genre="NLXH",
        status="ACTIVE",
    )
    poem = await _get_or_create_material(
        session,
        teacher,
        title='Bài thơ "Màu tự do của đất" (Trần Quang Quý)',
        author="Trần Quang Quý",
        source_info="In trong tập thơ cùng tên, NXB Hội Nhà văn, 2010. Giữ nguyên chữ 'mầu' theo văn bản nguồn.",
        content=POEM_TEXT,
        topic=topic_village,
        grade_level=11,
    )
    factory = await _get_or_create_material(
        session,
        teacher,
        title="Khói nhà máy và không gian đô thị",
        author="Ngữ liệu nội bộ THPT Đan Phượng",
        source_info="Trích đoạn đọc hiểu nội bộ, dùng cho đề nghị luận xã hội. Không phải bài thơ Trần Quang Quý.",
        content=FACTORY_SMOKE_TEXT,
        topic=topic_urban,
        grade_level=11,
    )
    await _get_or_create_prompt(
        session,
        teacher,
        title='Cảm nhận tự do trong "Màu tự do của đất"',
        writing_task=(
            "Phân tích cách Trần Quang Quý cảm nhận 'tự do' qua hình ảnh làng quê trong bài thơ "
            '"Màu tự do của đất". Bài viết khoảng 600 chữ; dẫn chứng chủ yếu lấy từ ngữ liệu được giao.'
        ),
        genre="NLVH",
        grade_level=11,
        topic=topic_village,
        materials=[poem],
    )
    await _get_or_create_prompt(
        session,
        teacher,
        title="Khói nhà máy và trách nhiệm của người trẻ",
        writing_task=(
            "Từ ngữ liệu về khói nhà máy và không gian đô thị, hãy viết bài nghị luận xã hội "
            "(khoảng 600 chữ) trình bày suy nghĩ về trách nhiệm của người trẻ trước ô nhiễm không khí "
            "và nhịp phát triển công nghiệp. Không phân tích bài thơ làng quê."
        ),
        genre="NLXH",
        grade_level=11,
        topic=topic_urban,
        materials=[factory],
    )
    incomplete = await session.execute(
        select(SourcePrompt).where(
            SourcePrompt.owner_teacher_id == teacher.id,
            SourcePrompt.title == "Đề nguồn chưa gắn ngữ liệu",
        )
    )
    if incomplete.scalar_one_or_none() is None:
        session.add(
            SourcePrompt(
                owner_teacher_id=teacher.id,
                title="Đề nguồn chưa gắn ngữ liệu",
                writing_task="",
                extra_guidance="",
                genre="NLXH",
                grade_level=11,
                status="INCOMPLETE",
            )
        )
        logger.info("Created incomplete source prompt")

    result = await session.execute(
        select(Rubric).where(Rubric.owner_teacher_id == teacher.id, Rubric.title.like("%4 tiêu chí%"))
    )
    rubric = result.scalar_one_or_none()
    if rubric is None:
        rubric = Rubric(
            owner_teacher_id=teacher.id,
            title="Barem chuẩn 4 tiêu chí (Bộ GD&ĐT)",
            short_title="Barem 4 tiêu chí",
            description="Thang 4.0 gồm 4 tiêu chí. Weight là điểm tối đa, không phải hệ số nhân.",
            status="READY",
        )
        session.add(rubric)
        await session.flush()
        session.add(
            RubricVersion(
                rubric_id=rubric.id,
                version=1,
                max_score=4,
                score_step=0.25,
                criteria=RUBRIC_4D_CRITERIA,
                status="APPROVED",
            )
        )
        logger.info("Created catalog rubric 4 tiêu chí")


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
        teacher = await seed_teacher(session, settings)
        student = await seed_student(session)
        await seed_student_named(
            session,
            login_id="bui.hamy",
            email="bui.hamy@thptdanphuong.edu.vn",
            display_name="Bùi Hà My",
        )
        assignment_soc = await seed_assignment(session)
        assignment_nlvh = await seed_assignment_nlvh(session)
        await seed_access(session, student, assignment_soc)
        await seed_access(session, student, assignment_nlvh)
        await seed_classroom(session, teacher, student)
        await seed_catalog(session, teacher)
        await session.commit()
    logger.info("Seed demo completed successfully!")


if __name__ == "__main__":
    asyncio.run(main())

