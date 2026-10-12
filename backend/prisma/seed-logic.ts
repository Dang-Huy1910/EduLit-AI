import type { Prisma } from "../src/generated/prisma/client.js";
import type { EduLitPrisma } from "../src/infrastructure/database/prisma.client.js";
import { sha256Utf8 } from "../src/core/hash.js";
import { offsetsForQuote } from "../src/core/utf16.js";
import { canonicalizeRubric, validateRubric } from "../src/modules/assignments/domain/rubric.js";
import { buildProfileSummary, emptySummary } from "../src/modules/writing-profile/domain/profile.js";
import { SEED_IDS } from "./seed-ids.js";

const NLXH_RUBRIC = canonicalizeRubric(
  validateRubric(
    {
      criteria: [
        {
          criterionId: "C1_STRUCTURE",
          name: "Bố cục & cấu trúc lập luận",
          weight: "2.00",
          descriptor: "Đủ ba phần, luận điểm tách bạch.",
        },
        {
          criterionId: "C2_ARGUMENT",
          name: "Luận điểm & dẫn chứng",
          weight: "4.00",
          requiredElements: ["Giải thích khái niệm", "Dẫn chứng thực tế"],
        },
        {
          criterionId: "C3_EXPRESSION",
          name: "Diễn đạt, chính tả & ngữ pháp",
          weight: "2.00",
        },
        {
          criterionId: "C4_CREATIVITY",
          name: "Sáng tạo & cảm xúc cá nhân",
          weight: "2.00",
        },
      ],
    },
    "10.00",
    "0.25",
  ),
);

const NLVH_RUBRIC = canonicalizeRubric(
  validateRubric(
    {
      criteria: [
        {
          criterionId: "V1_CONTENT",
          name: "Nội dung và kiến giải tác phẩm",
          weight: "5.00",
          descriptor: "Nắm hình tượng sông Hương, không yêu cầu phản đề.",
        },
        {
          criterionId: "V2_FORM",
          name: "Hình thức nghị luận văn học",
          weight: "3.00",
        },
        {
          criterionId: "V3_LANGUAGE",
          name: "Ngôn ngữ và cảm thụ",
          weight: "2.00",
        },
      ],
    },
    "10.00",
    "0.25",
  ),
);

export const SEED_TEXTS = {
  myNlxh:
    "Ý chí và lòng kiên định giúp người trẻ không bỏ cuộc khi gặp khó khăn. Tuy nhiên, kiên định không đồng nghĩa với bảo thủ. Em lấy gương một bạn lớp mình kiên trì ôn tập giữa áp lực thi cử, chứ không sao chép văn mẫu.",
  myNlvh:
    "Sông Hương ở thượng nguồn hiện lên vừa trữ tình vừa dữ dội, như một sức sống mãnh liệt trước khi dịu dàng giữa thành phố Huế. 👍 Cảm nhận ấy gắn với nhịp văn của Hoàng Phủ Ngọc Tường.",
  anNlxh:
    "Người trẻ cần kiên định nhưng bài viết của em còn lặp ý và thiếu dẫn chứng cụ thể. Câu văn ghép thiếu vế nên lập luận chưa chặt.",
};

export async function seedDatabase(prisma: EduLitPrisma, passwordHash: string): Promise<void> {
  await upsertUser(prisma, {
    id: SEED_IDS.teacher,
    loginId: "dang.loan",
    displayName: "Cô Đặng Loan",
    role: "TEACHER",
    passwordHash,
  });
  await upsertUser(prisma, {
    id: SEED_IDS.studentMy,
    loginId: "bui.hamy",
    displayName: "Bùi Hà My",
    role: "STUDENT",
    passwordHash,
  });
  await upsertUser(prisma, {
    id: SEED_IDS.studentAn,
    loginId: "nguyen.an",
    displayName: "Nguyễn An",
    role: "STUDENT",
    passwordHash,
  });

  await upsertAssignment(prisma, {
    id: SEED_IDS.assignmentNlxh,
    teacherId: SEED_IDS.teacher,
    code: "VAN12-NLXH-01",
    title: "Nghị luận xã hội: Ý chí và lòng kiên định",
    instructions:
      "Viết bài nghị luận khoảng 600 chữ bàn về ý chí và lòng kiên định của người trẻ. Không bắt buộc mọi đề phải có phản đề; đề này gợi mở hướng nhìn đa chiều.",
    genre: "NLXH",
    gradeLevel: 12,
    learningMaterialText:
      "Học liệu văn bản: trích ý kiến bàn về bản lĩnh người trẻ trong đời sống hiện đại. Đây là ngữ liệu nhập tay, không phải file OCR.",
    rubric: NLXH_RUBRIC,
    maxScore: "10.00",
    scoreStep: "0.25",
    status: "PUBLISHED",
    publishedAt: new Date("2026-09-01T00:00:00.000Z"),
    dueAt: new Date("2026-10-25T16:59:00.000Z"),
  });

  await upsertAssignment(prisma, {
    id: SEED_IDS.assignmentNlvh,
    teacherId: SEED_IDS.teacher,
    code: "VAN12-NLVH-02",
    title: "Nghị luận văn học: Sông Hương — Hoàng Phủ Ngọc Tường",
    instructions: "Phân tích nét trữ tình và sức sống của sông Hương ở thượng nguồn.",
    genre: "NLVH",
    gradeLevel: 12,
    learningMaterialText:
      "Ngữ liệu: đoạn miêu tả sông Hương lúc còn là bản trường ca của rừng già. Rubric văn học riêng, không dùng chung barem NLXH.",
    rubric: NLVH_RUBRIC,
    maxScore: "10.00",
    scoreStep: "0.25",
    status: "PUBLISHED",
    publishedAt: new Date("2026-09-15T00:00:00.000Z"),
    dueAt: new Date("2026-11-05T16:59:00.000Z"),
  });

  await createIfMissing(prisma, "socraticSession", SEED_IDS.sessionMyNlxh, () =>
    prisma.socraticSession.create({
      data: {
        id: SEED_IDS.sessionMyNlxh,
        studentId: SEED_IDS.studentMy,
        assignmentId: SEED_IDS.assignmentNlxh,
        contextSnapshot: {
          assignmentId: SEED_IDS.assignmentNlxh,
          code: "VAN12-NLXH-01",
          title: "Nghị luận xã hội: Ý chí và lòng kiên định",
          instructions:
            "Viết bài nghị luận khoảng 600 chữ bàn về ý chí và lòng kiên định của người trẻ. Không bắt buộc mọi đề phải có phản đề; đề này gợi mở hướng nhìn đa chiều.",
          genre: "NLXH",
          gradeLevel: 12,
          learningMaterialText:
            "Học liệu văn bản: trích ý kiến bàn về bản lĩnh người trẻ trong đời sống hiện đại. Đây là ngữ liệu nhập tay, không phải file OCR.",
          rubric: NLXH_RUBRIC,
          maxScore: "10.00",
          scoreStep: "0.25",
        } as Prisma.InputJsonValue,
        outline: { sections: [{ id: "open", title: "Mở bài", points: ["Đặt vấn đề kiên định"] }] },
        status: "COMPLETED",
      },
    }),
  );

  await createIfMissing(prisma, "chatMessage", SEED_IDS.messageMy1, () =>
    prisma.chatMessage.create({
      data: {
        id: SEED_IDS.messageMy1,
        sessionId: SEED_IDS.sessionMyNlxh,
        sequence: 1,
        role: "USER",
        content: "Em muốn bàn về kiên định nhưng sợ viết thành văn mẫu.",
      },
    }),
  );
  await createIfMissing(prisma, "chatMessage", SEED_IDS.messageMy2, () =>
    prisma.chatMessage.create({
      data: {
        id: SEED_IDS.messageMy2,
        sessionId: SEED_IDS.sessionMyNlxh,
        sequence: 2,
        role: "ASSISTANT",
        content: "Em có thể nêu một tình huống cụ thể em đã kiên trì. Trợ lý không viết hộ đoạn văn.",
      },
    }),
  );

  await createSubmission(prisma, {
    id: SEED_IDS.submissionMyNlxh,
    studentId: SEED_IDS.studentMy,
    assignmentId: SEED_IDS.assignmentNlxh,
    socraticSessionId: SEED_IDS.sessionMyNlxh,
    text: SEED_TEXTS.myNlxh,
    code: "VAN12-NLXH-01",
    title: "Nghị luận xã hội: Ý chí và lòng kiên định",
    genre: "NLXH",
    rubric: NLXH_RUBRIC,
  });
  await createSubmission(prisma, {
    id: SEED_IDS.submissionMyNlvh,
    studentId: SEED_IDS.studentMy,
    assignmentId: SEED_IDS.assignmentNlvh,
    text: SEED_TEXTS.myNlvh,
    code: "VAN12-NLVH-02",
    title: "Nghị luận văn học: Sông Hương — Hoàng Phủ Ngọc Tường",
    genre: "NLVH",
    rubric: NLVH_RUBRIC,
  });
  await createSubmission(prisma, {
    id: SEED_IDS.submissionAnNlxh,
    studentId: SEED_IDS.studentAn,
    assignmentId: SEED_IDS.assignmentNlxh,
    text: SEED_TEXTS.anNlxh,
    code: "VAN12-NLXH-01",
    title: "Nghị luận xã hội: Ý chí và lòng kiên định",
    genre: "NLXH",
    rubric: NLXH_RUBRIC,
  });

  await createAssessment(prisma, {
    id: SEED_IDS.assessmentMyNlxh,
    submissionId: SEED_IDS.submissionMyNlxh,
    studentId: SEED_IDS.studentMy,
    rubric: NLXH_RUBRIC,
    evaluations: [
      { criterionId: "C1_STRUCTURE", awardedScore: "1.75" },
      { criterionId: "C2_ARGUMENT", awardedScore: "3.25" },
      { criterionId: "C3_EXPRESSION", awardedScore: "1.50" },
      { criterionId: "C4_CREATIVITY", awardedScore: "1.50" },
    ],
    totalScore: "8.00",
  });
  await createAssessment(prisma, {
    id: SEED_IDS.assessmentMyNlvh,
    submissionId: SEED_IDS.submissionMyNlvh,
    studentId: SEED_IDS.studentMy,
    rubric: NLVH_RUBRIC,
    evaluations: [
      { criterionId: "V1_CONTENT", awardedScore: "4.25" },
      { criterionId: "V2_FORM", awardedScore: "2.50" },
      { criterionId: "V3_LANGUAGE", awardedScore: "1.75" },
    ],
    totalScore: "8.50",
  });
  await createAssessment(prisma, {
    id: SEED_IDS.assessmentAnNlxh,
    submissionId: SEED_IDS.submissionAnNlxh,
    studentId: SEED_IDS.studentAn,
    rubric: NLXH_RUBRIC,
    evaluations: [
      { criterionId: "C1_STRUCTURE", awardedScore: "1.25" },
      { criterionId: "C2_ARGUMENT", awardedScore: "2.00" },
      { criterionId: "C3_EXPRESSION", awardedScore: "1.00" },
      { criterionId: "C4_CREATIVITY", awardedScore: "1.00" },
    ],
    totalScore: "5.25",
  });

  const myQuote1 = "kiên định không đồng nghĩa với bảo thủ";
  const myQuote2 = "không sao chép văn mẫu";
  const myQuote3 = "vừa trữ tình vừa dữ dội";
  const anQuote = "Câu văn ghép thiếu vế";

  await createObservation(prisma, {
    id: SEED_IDS.observationMyStructure,
    studentId: SEED_IDS.studentMy,
    assessmentId: SEED_IDS.assessmentMyNlxh,
    kind: "STRENGTH",
    featureKey: "counterargument-clarity",
    description: "Phân biệt kiên định với bảo thủ bằng câu chuyển ý rõ.",
    genre: "NLXH",
    text: SEED_TEXTS.myNlxh,
    quote: myQuote1,
    status: "SUPPORTED",
  });
  await createObservation(prisma, {
    id: SEED_IDS.observationMyArgument,
    studentId: SEED_IDS.studentMy,
    assessmentId: SEED_IDS.assessmentMyNlxh,
    kind: "STYLE",
    featureKey: "avoids-template",
    description: "Có ý thức tránh văn mẫu.",
    genre: "NLXH",
    text: SEED_TEXTS.myNlxh,
    quote: myQuote2,
    status: "PROVISIONAL",
  });
  await createObservation(prisma, {
    id: SEED_IDS.observationMyNlvhStyle,
    studentId: SEED_IDS.studentMy,
    assessmentId: SEED_IDS.assessmentMyNlvh,
    kind: "STRENGTH",
    featureKey: "imagery-control",
    description: "Nắm được sự đối lập trữ tình/dữ dội của hình tượng.",
    genre: "NLVH",
    text: SEED_TEXTS.myNlvh,
    quote: myQuote3,
    status: "SUPPORTED",
  });
  await createObservation(prisma, {
    id: SEED_IDS.observationAnWeakness,
    studentId: SEED_IDS.studentAn,
    assessmentId: SEED_IDS.assessmentAnNlxh,
    kind: "WEAKNESS",
    featureKey: "compound-sentence-gap",
    description: "Còn lỗi câu ghép thiếu vế.",
    genre: "NLXH",
    text: SEED_TEXTS.anNlxh,
    quote: anQuote,
    status: "PROVISIONAL",
  });

  await upsertProfile(prisma, SEED_IDS.profileMy, SEED_IDS.studentMy, {
    items: [{ id: "goal-my-1", text: "Muốn viết phản đề tự nhiên hơn, không sáo." }],
  });
  await upsertProfile(prisma, SEED_IDS.profileAn, SEED_IDS.studentAn, {
    items: [{ id: "goal-an-1", text: "Muốn viết câu ghép đủ vế." }],
  });
}

async function upsertUser(
  prisma: EduLitPrisma,
  data: {
    id: string;
    loginId: string;
    displayName: string;
    role: "TEACHER" | "STUDENT";
    passwordHash: string;
  },
) {
  const byId = await prisma.user.findUnique({ where: { id: data.id } });
  if (byId) {
    return;
  }
  const byLogin = await prisma.user.findUnique({ where: { loginId: data.loginId } });
  if (byLogin) {
    return;
  }
  await prisma.user.create({
    data: {
      id: data.id,
      loginId: data.loginId,
      displayName: data.displayName,
      passwordHash: data.passwordHash,
      role: data.role,
      status: "ACTIVE",
    },
  });
}

async function upsertAssignment(
  prisma: EduLitPrisma,
  data: {
    id: string;
    teacherId: string;
    code: string;
    title: string;
    instructions: string;
    genre: string;
    gradeLevel: number;
    learningMaterialText: string;
    rubric: Prisma.InputJsonValue;
    maxScore: string;
    scoreStep: string;
    status: "PUBLISHED";
    publishedAt: Date;
    dueAt: Date;
  },
) {
  await prisma.assignment.upsert({
    where: { code: data.code },
    create: data,
    update: {},
  });
}

async function createSubmission(
  prisma: EduLitPrisma,
  data: {
    id: string;
    studentId: string;
    assignmentId: string;
    socraticSessionId?: string;
    text: string;
    code: string;
    title: string;
    genre: string;
    rubric: Prisma.InputJsonValue;
  },
) {
  const existing = await prisma.submission.findUnique({
    where: { studentId_assignmentId: { studentId: data.studentId, assignmentId: data.assignmentId } },
  });
  if (existing) {
    return;
  }
  await prisma.submission.create({
    data: {
      id: data.id,
      studentId: data.studentId,
      assignmentId: data.assignmentId,
      socraticSessionId: data.socraticSessionId,
      text: data.text,
      contentHash: sha256Utf8(data.text),
      assignmentSnapshot: {
        assignmentId: data.assignmentId,
        code: data.code,
        title: data.title,
        instructions: "",
        genre: data.genre,
        gradeLevel: 12,
        learningMaterialText: "",
        rubric: data.rubric,
        maxScore: "10.00",
        scoreStep: "0.25",
        status: "PUBLISHED",
        publishedAt: "2026-09-01T00:00:00.000Z",
        dueAt: null,
        snapshottedAt: "2026-10-01T00:00:00.000Z",
      },
      submittedAt: new Date("2026-10-02T00:00:00.000Z"),
    },
  });
}

async function createAssessment(
  prisma: EduLitPrisma,
  data: {
    id: string;
    submissionId: string;
    studentId: string;
    rubric: Prisma.InputJsonValue;
    evaluations: Array<{ criterionId: string; awardedScore: string }>;
    totalScore: string;
  },
) {
  const existing = await prisma.assessment.findUnique({ where: { submissionId: data.submissionId } });
  if (existing) {
    return;
  }
  await prisma.assessment.create({
    data: {
      id: data.id,
      submissionId: data.submissionId,
      studentId: data.studentId,
      rubricSnapshot: data.rubric,
      detailedEvaluations: data.evaluations,
      totalScore: data.totalScore,
      maxScore: "10.00",
      status: "PUBLISHED",
      modelName: "gemini-2.5-flash",
      promptVersion: "seed-fixture-v1",
      assessedAt: new Date("2026-10-03T00:00:00.000Z"),
      publishedAt: new Date("2026-10-03T00:00:00.000Z"),
    },
  });
}

async function createObservation(
  prisma: EduLitPrisma,
  data: {
    id: string;
    studentId: string;
    assessmentId: string;
    kind: "STRENGTH" | "WEAKNESS" | "STYLE";
    featureKey: string;
    description: string;
    genre: string;
    text: string;
    quote: string;
    status: "PROVISIONAL" | "SUPPORTED";
  },
) {
  const existing = await prisma.writingObservation.findUnique({
    where: {
      studentId_assessmentId_featureKey: {
        studentId: data.studentId,
        assessmentId: data.assessmentId,
        featureKey: data.featureKey,
      },
    },
  });
  if (existing) {
    return;
  }
  const { start, end } = offsetsForQuote(data.text, data.quote);
  await prisma.writingObservation.create({
    data: {
      id: data.id,
      studentId: data.studentId,
      assessmentId: data.assessmentId,
      kind: data.kind,
      featureKey: data.featureKey,
      description: data.description,
      genre: data.genre,
      evidenceQuote: data.quote,
      evidenceStart: start,
      evidenceEnd: end,
      status: data.status,
      observedAt: new Date("2026-10-03T00:00:00.000Z"),
    },
  });
}

async function upsertProfile(
  prisma: EduLitPrisma,
  id: string,
  studentId: string,
  declaredGoals: { items: Array<{ id: string; text: string }> },
) {
  const existing = await prisma.writingProfile.findUnique({ where: { studentId } });
  const rows = await prisma.writingObservation.findMany({
    where: { studentId, status: { not: "INVALIDATED" } },
    include: { assessment: { include: { submission: true } } },
  });
  const built = buildProfileSummary(
    rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      featureKey: row.featureKey,
      description: row.description,
      status: row.status,
      assessmentId: row.assessmentId,
      assignmentId: row.assessment.submission.assignmentId,
      observedAt: row.observedAt,
    })),
  );
  if (existing) {
    return;
  }
  await prisma.writingProfile.create({
    data: {
      id,
      studentId,
      declaredGoals,
      summary: (built.summary ?? emptySummary()) as Prisma.InputJsonValue,
      observationIds: built.observationIds,
      version: 1,
    },
  });
}

async function createIfMissing(
  prisma: EduLitPrisma,
  model: "socraticSession" | "chatMessage",
  id: string,
  create: () => Promise<unknown>,
) {
  if (model === "socraticSession") {
    const existing = await prisma.socraticSession.findUnique({ where: { id } });
    if (existing) {
      return;
    }
  } else {
    const existing = await prisma.chatMessage.findUnique({ where: { id } });
    if (existing) {
      return;
    }
  }
  await create();
}
