import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DomainError } from "../../src/core/errors.js";
import { FakeAssessmentAi, fakeAssessmentProviderError } from "../../src/infrastructure/ai/fake-assessment.adapter.js";
import { createAssignment } from "../../src/modules/assignments/application/create-assignment.js";
import { startSocraticSession } from "../../src/modules/socratic/application/start-session.js";
import { submitStudentText } from "../../src/modules/assessment/application/submit-student-text.js";
import { assessSubmission } from "../../src/modules/assessment/application/assess-submission.js";
import { getSubmission } from "../../src/modules/assessment/application/get-submission.js";
import { getAssessment } from "../../src/modules/assessment/application/get-assessment.js";
import { publishReviewedAssessment } from "../../src/modules/assessment/application/publish-reviewed-assessment.js";
import { saveObservationsAndRefreshProfile } from "../../src/modules/writing-profile/application/save-observations.js";
import { assertScoringInputIsolated } from "../../src/modules/assessment/application/build-scoring-payload.js";
import type { AssessmentActor } from "../../src/modules/assessment/domain/actor.js";
import type { EduLitPrisma } from "../../src/infrastructure/database/prisma.client.js";
import { SAMPLE_RUBRIC, createStudent, createTeacher, withTestPrisma } from "../helpers/db.js";
import { modelOutputForText } from "../helpers/assessment.js";
import { offsetsForQuote } from "../../src/core/utf16.js";

const ESSAY = "Người trẻ kiên định khi ôn tập trung thực, không sao chép văn mẫu.";

async function fixture(prisma: EduLitPrisma, code: string) {
  const teacher = await createTeacher(prisma, `gv-${randomUUID()}`);
  const student = await createStudent(prisma, `hs-${randomUUID()}`, "Học sinh thử");
  const otherTeacher = await createTeacher(prisma, `gv2-${randomUUID()}`);
  const otherStudent = await createStudent(prisma, `hs2-${randomUUID()}`, "Khác");
  const assignment = await createAssignment(prisma, {
    teacherId: teacher.id,
    code,
    title: "Bản lĩnh",
    instructions: "Viết nghị luận về bản lĩnh người trẻ.",
    genre: "NLXH",
    gradeLevel: 12,
    learningMaterialText: "Ngữ liệu: thành tích cần đi cùng sự trung thực.",
    rubric: SAMPLE_RUBRIC,
    maxScore: "10.00",
    scoreStep: "0.25",
    status: "PUBLISHED",
  });
  const studentActor: AssessmentActor = { userId: student.id, role: "STUDENT" };
  const teacherActor: AssessmentActor = { userId: teacher.id, role: "TEACHER" };
  return { teacher, student, otherTeacher, otherStudent, assignment, studentActor, teacherActor };
}

test("submit freezes session snapshot, rejects empty/too-large, and replays identical text", async () => {
  await withTestPrisma(async (prisma) => {
    const { assignment, studentActor, teacher } = await fixture(prisma, "AS-SUB");
    const session = await startSocraticSession(prisma, {
      studentId: studentActor.userId,
      assignmentId: assignment.id,
    });
    await prisma.assignment.update({
      where: { id: assignment.id },
      data: { title: "Đề mới", instructions: "Hướng dẫn mới" },
    });
    const first = await submitStudentText(prisma, studentActor, {
      assignmentId: assignment.id,
      socraticSessionId: session.id,
      text: ESSAY,
    });
    const snapshot = (await prisma.submission.findUniqueOrThrow({ where: { id: first.submission.id } }))
      .assignmentSnapshot as { title: string };
    assert.equal(snapshot.title, "Bản lĩnh");
    const replay = await submitStudentText(prisma, studentActor, {
      assignmentId: assignment.id,
      socraticSessionId: session.id,
      text: ESSAY,
    });
    assert.equal(replay.replayed, true);
    assert.equal(replay.submission.id, first.submission.id);
    await assert.rejects(
      () =>
        submitStudentText(prisma, studentActor, {
          assignmentId: assignment.id,
          text: `${ESSAY} thêm câu.`,
        }),
      (error: unknown) => error instanceof DomainError && error.code === "SUBMISSION_CONFLICT",
    );
    await assert.rejects(
      () => submitStudentText(prisma, studentActor, { assignmentId: assignment.id, text: "   " }),
      (error: unknown) => error instanceof DomainError && error.code === "SUBMISSION_TEXT",
    );
    const other = await createStudent(prisma, `hs-t-${randomUUID()}`, "Khác đề");
    const otherAssignment = await createAssignment(prisma, {
      teacherId: teacher.id,
      code: "AS-BIG",
      title: "Đề",
      instructions: "x",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "x",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    await assert.rejects(
      () =>
        submitStudentText(
          prisma,
          { userId: other.id, role: "STUDENT" },
          { assignmentId: otherAssignment.id, text: "a".repeat(20_001) },
        ),
      (error: unknown) => error instanceof DomainError && error.code === "SUBMISSION_TOO_LARGE",
    );
  });
});

test("teacher grades to AI_DRAFT; student sees pending; other teacher is blocked", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "AS-GRADE");
    const submitted = await submitStudentText(prisma, setup.studentActor, {
      assignmentId: setup.assignment.id,
      text: ESSAY,
    });
    const fake = new FakeAssessmentAi();
    fake.nextOutput = modelOutputForText(ESSAY);
    const graded = await assessSubmission(prisma, fake, setup.teacherActor, {
      submissionId: submitted.submission.id,
    });
    assert.equal(graded.replayed, false);
    assert.equal(graded.assessment.status, "AI_DRAFT");
    assertScoringInputIsolated(graded.scoringInput);
    assert.equal(fake.calls.length, 1);
    assert.match(fake.calls[0]?.userPayload ?? "", /UNTRUSTED/);
    assert.doesNotMatch(JSON.stringify(graded.scoringInput), /declaredGoals/);

    const studentView = await getSubmission(prisma, setup.studentActor, {
      submissionId: submitted.submission.id,
    });
    assert.equal(studentView.audience, "student");
    assert.equal(studentView.assessment.status, "PENDING");

    await assert.rejects(
      () =>
        assessSubmission(
          prisma,
          fake,
          { userId: setup.otherTeacher.id, role: "TEACHER" },
          { submissionId: submitted.submission.id },
        ),
      (error: unknown) => error instanceof DomainError && error.code === "ASSESSMENT_OWNERSHIP",
    );
    await assert.rejects(
      () =>
        getSubmission(
          prisma,
          { userId: setup.otherStudent.id, role: "STUDENT" },
          { submissionId: submitted.submission.id },
        ),
      (error: unknown) => error instanceof DomainError && error.code === "SUBMISSION_NOT_FOUND",
    );
  });
});

test("invalid AI output leaves no assessment; replay and concurrent grade share one row", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "AS-INVALID");
    const submitted = await submitStudentText(prisma, setup.studentActor, {
      assignmentId: setup.assignment.id,
      text: ESSAY,
    });
    const bad = new FakeAssessmentAi();
    bad.nextOutput = {
      detailedEvaluations: [
        {
          criterionId: "C1",
          awardedScore: "9.00",
          comment: "sai",
          strengths: [],
          weaknesses: [],
          evidence: [{ quote: "không có", start: 0, end: 7 }],
          missingElements: [],
        },
      ],
      totalScore: "9.00",
    };
    await assert.rejects(
      () =>
        assessSubmission(prisma, bad, setup.teacherActor, { submissionId: submitted.submission.id }),
      DomainError,
    );
    assert.equal(await prisma.assessment.count({ where: { submissionId: submitted.submission.id } }), 0);

    const fake = new FakeAssessmentAi();
    fake.nextOutput = modelOutputForText(ESSAY);
    const first = await assessSubmission(prisma, fake, setup.teacherActor, {
      submissionId: submitted.submission.id,
    });
    const second = await assessSubmission(prisma, fake, setup.teacherActor, {
      submissionId: submitted.submission.id,
    });
    assert.equal(second.replayed, true);
    assert.equal(second.assessment.id, first.assessment.id);
    assert.equal(fake.calls.length, 1);

    const setupB = await fixture(prisma, "AS-RACE");
    const submittedB = await submitStudentText(prisma, setupB.studentActor, {
      assignmentId: setupB.assignment.id,
      text: ESSAY,
    });
    const holdA = new FakeAssessmentAi();
    holdA.nextOutput = modelOutputForText(ESSAY);
    let releaseA!: () => void;
    holdA.hold = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const holdB = new FakeAssessmentAi();
    holdB.nextOutput = modelOutputForText(ESSAY);
    const inflightA = assessSubmission(prisma, holdA, setupB.teacherActor, {
      submissionId: submittedB.submission.id,
    });
    const waitStart = Date.now();
    while (holdA.calls.length === 0 && Date.now() - waitStart < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    const inflightB = assessSubmission(prisma, holdB, setupB.teacherActor, {
      submissionId: submittedB.submission.id,
    });
    releaseA();
    const [one, two] = await Promise.all([inflightA, inflightB]);
    assert.equal(one.assessment.id, two.assessment.id);
    assert.equal(await prisma.assessment.count({ where: { submissionId: submittedB.submission.id } }), 1);
  });
});

test("inactive teacher during generation does not persist; closed assignment still grades prior work", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "AS-INACTIVE");
    const submitted = await submitStudentText(prisma, setup.studentActor, {
      assignmentId: setup.assignment.id,
      text: ESSAY,
    });
    const hold = new FakeAssessmentAi();
    hold.nextOutput = modelOutputForText(ESSAY);
    let release!: () => void;
    hold.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inflight = assessSubmission(prisma, hold, setup.teacherActor, {
      submissionId: submitted.submission.id,
    });
    const waitStart = Date.now();
    while (hold.calls.length === 0 && Date.now() - waitStart < 2000) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await prisma.user.update({ where: { id: setup.teacher.id }, data: { status: "INACTIVE" } });
    release();
    await assert.rejects(
      () => inflight,
      (error: unknown) => error instanceof DomainError && error.code === "ACTOR_INACTIVE",
    );
    assert.equal(await prisma.assessment.count({ where: { submissionId: submitted.submission.id } }), 0);

    await prisma.user.update({ where: { id: setup.teacher.id }, data: { status: "ACTIVE" } });
    await prisma.assignment.update({ where: { id: setup.assignment.id }, data: { status: "CLOSED" } });
    const fake = new FakeAssessmentAi();
    fake.nextOutput = modelOutputForText(ESSAY);
    const graded = await assessSubmission(prisma, fake, setup.teacherActor, {
      submissionId: submitted.submission.id,
    });
    assert.equal(graded.assessment.status, "AI_DRAFT");
  });
});

test("publish is teacher confirmation; retry keeps publishedAt; student then sees scores", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "AS-PUB");
    const submitted = await submitStudentText(prisma, setup.studentActor, {
      assignmentId: setup.assignment.id,
      text: ESSAY,
    });
    const fake = new FakeAssessmentAi();
    fake.nextOutput = modelOutputForText(ESSAY);
    const graded = await assessSubmission(prisma, fake, setup.teacherActor, {
      submissionId: submitted.submission.id,
    });
    await assert.rejects(
      () =>
        publishReviewedAssessment(
          prisma,
          { userId: setup.otherTeacher.id, role: "TEACHER" },
          { assessmentId: graded.assessment.id },
        ),
      (error: unknown) => error instanceof DomainError && error.code === "ASSESSMENT_OWNERSHIP",
    );
    const published = await publishReviewedAssessment(prisma, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    assert.equal(published.replayed, false);
    assert.equal(published.assessment.status, "PUBLISHED");
    const firstPublishedAt = published.assessment.publishedAt;
    const again = await publishReviewedAssessment(prisma, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    assert.equal(again.replayed, true);
    assert.equal(again.assessment.publishedAt, firstPublishedAt);
    const studentView = await getSubmission(prisma, setup.studentActor, {
      submissionId: submitted.submission.id,
    });
    assert.equal(studentView.audience, "student");
    assert.equal(studentView.assessment.status, "PUBLISHED");
    if (studentView.audience === "student" && studentView.assessment.status === "PUBLISHED") {
      assert.equal(studentView.assessment.totalScore, "7.50");
    }
    const studentAssessment = await getAssessment(prisma, setup.studentActor, {
      assessmentId: graded.assessment.id,
    });
    assert.equal(studentAssessment.audience, "student");
    assert.equal(studentAssessment.assessment.status, "PUBLISHED");
  });
});

test("scoring payload stays isolated after profile changes; provider errors do not fabricate scores", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "AS-ISO");
    const submitted = await submitStudentText(prisma, setup.studentActor, {
      assignmentId: setup.assignment.id,
      text: ESSAY,
    });
    const quote = "không sao chép văn mẫu";
    const { start, end } = offsetsForQuote(ESSAY, quote);
    const fake = new FakeAssessmentAi();
    fake.nextOutput = modelOutputForText(ESSAY);
    const first = await assessSubmission(prisma, fake, setup.teacherActor, {
      submissionId: submitted.submission.id,
    });
    await publishReviewedAssessment(prisma, setup.teacherActor, { assessmentId: first.assessment.id });
    await saveObservationsAndRefreshProfile(prisma, {
      studentId: setup.student.id,
      assessmentId: first.assessment.id,
      observations: [
        {
          kind: "STYLE",
          featureKey: "avoids-template",
          description: "Tránh văn mẫu",
          genre: "NLXH",
          evidenceQuote: quote,
          evidenceStart: start,
          evidenceEnd: end,
        },
      ],
    });
    const otherStudent = await createStudent(prisma, `hs-iso-${randomUUID()}`, "B");
    const submitted2 = await submitStudentText(
      prisma,
      { userId: otherStudent.id, role: "STUDENT" },
      { assignmentId: setup.assignment.id, text: ESSAY },
    );
    const fake2 = new FakeAssessmentAi();
    fake2.nextOutput = modelOutputForText(ESSAY);
    const second = await assessSubmission(prisma, fake2, setup.teacherActor, {
      submissionId: submitted2.submission.id,
    });
    assert.deepEqual(first.scoringInput, second.scoringInput);
    assertScoringInputIsolated(second.scoringInput);

    const failSetup = await fixture(prisma, "AS-ERR");
    const failSub = await submitStudentText(prisma, failSetup.studentActor, {
      assignmentId: failSetup.assignment.id,
      text: ESSAY,
    });
    const errFake = new FakeAssessmentAi();
    errFake.nextError = fakeAssessmentProviderError("AI_INVALID_OUTPUT", "blocked");
    await assert.rejects(
      () =>
        assessSubmission(prisma, errFake, failSetup.teacherActor, { submissionId: failSub.submission.id }),
      (error: unknown) => error instanceof DomainError && error.code === "AI_INVALID_OUTPUT",
    );
    assert.equal(await prisma.assessment.count({ where: { submissionId: failSub.submission.id } }), 0);
  });
});
