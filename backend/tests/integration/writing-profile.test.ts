import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { DomainError, VersionConflictError } from "../../src/core/errors.js";
import { FakeAssessmentAi } from "../../src/infrastructure/ai/fake-assessment.adapter.js";
import { FakeWritingObservationAi } from "../../src/infrastructure/ai/fake-writing-observation.adapter.js";
import { FakeSocraticAi } from "../../src/infrastructure/ai/fake-socratic.adapter.js";
import { createAssignment } from "../../src/modules/assignments/application/create-assignment.js";
import { submitStudentText } from "../../src/modules/assessment/application/submit-student-text.js";
import { assessSubmission } from "../../src/modules/assessment/application/assess-submission.js";
import { publishReviewedAssessment } from "../../src/modules/assessment/application/publish-reviewed-assessment.js";
import { assertScoringInputIsolated } from "../../src/modules/assessment/application/build-scoring-payload.js";
import { extractPublishedObservations } from "../../src/modules/writing-profile/application/extract-published-observations.js";
import { getOwnWritingProfile } from "../../src/modules/writing-profile/application/get-own-writing-profile.js";
import { reviewObservationStatus } from "../../src/modules/writing-profile/application/review-observation-status.js";
import { getProfileContextForSession } from "../../src/modules/writing-profile/application/query-profile-context.js";
import { openOrResumeSocraticSession } from "../../src/modules/socratic/application/open-or-resume-session.js";
import { sendSocraticTurn } from "../../src/modules/socratic/application/send-socratic-turn.js";
import type { AssessmentActor } from "../../src/modules/assessment/domain/actor.js";
import type { StudentActor } from "../../src/modules/socratic/domain/actor.js";
import type { EduLitPrisma } from "../../src/infrastructure/database/prisma.client.js";
import { SAMPLE_RUBRIC, createStudent, createTeacher, withTestPrisma } from "../helpers/db.js";
import { modelOutputForText } from "../helpers/assessment.js";
import { observationOutputForText } from "../helpers/writing-profile.js";

const ESSAY = "Người trẻ kiên định khi ôn tập trung thực, không sao chép văn mẫu.";

async function waitForCalls(getCount: () => number): Promise<void> {
  const started = Date.now();
  while (getCount() === 0 && Date.now() - started < 2000) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function fixture(prisma: EduLitPrisma, code: string, genre = "NLXH") {
  const teacher = await createTeacher(prisma, `gv-${randomUUID()}`);
  const student = await createStudent(prisma, `hs-${randomUUID()}`, "Học sinh thử");
  const otherTeacher = await createTeacher(prisma, `gv2-${randomUUID()}`);
  const otherStudent = await createStudent(prisma, `hs2-${randomUUID()}`, "Khác");
  const assignment = await createAssignment(prisma, {
    teacherId: teacher.id,
    code,
    title: "Bản lĩnh",
    instructions: "Viết nghị luận về bản lĩnh người trẻ.",
    genre,
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

async function publishEssay(
  prisma: EduLitPrisma,
  setup: Awaited<ReturnType<typeof fixture>>,
  text = ESSAY,
) {
  const submitted = await submitStudentText(prisma, setup.studentActor, {
    assignmentId: setup.assignment.id,
    text,
  });
  const gradeAi = new FakeAssessmentAi();
  gradeAi.nextOutput = modelOutputForText(text);
  const graded = await assessSubmission(prisma, gradeAi, setup.teacherActor, {
    submissionId: submitted.submission.id,
  });
  await publishReviewedAssessment(prisma, setup.teacherActor, { assessmentId: graded.assessment.id });
  return { submitted, graded };
}

test("AI_DRAFT is blocked before the observation provider is called", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "WP-DRAFT");
    const submitted = await submitStudentText(prisma, setup.studentActor, {
      assignmentId: setup.assignment.id,
      text: ESSAY,
    });
    const gradeAi = new FakeAssessmentAi();
    gradeAi.nextOutput = modelOutputForText(ESSAY);
    const graded = await assessSubmission(prisma, gradeAi, setup.teacherActor, {
      submissionId: submitted.submission.id,
    });
    const fake = new FakeWritingObservationAi();
    await assert.rejects(
      () =>
        extractPublishedObservations(prisma, fake, setup.teacherActor, {
          assessmentId: graded.assessment.id,
        }),
      (error: unknown) => error instanceof DomainError && error.code === "OBSERVATION_STATUS",
    );
    assert.equal(fake.calls.length, 0);
  });
});

test("only the owning active teacher extracts a PUBLISHED source; student and others are blocked", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "WP-OWN");
    const { graded } = await publishEssay(prisma, setup);
    const fake = new FakeWritingObservationAi();
    fake.nextOutput = observationOutputForText(ESSAY);

    await assert.rejects(
      () =>
        extractPublishedObservations(prisma, fake, setup.studentActor, {
          assessmentId: graded.assessment.id,
        }),
      (error: unknown) => error instanceof DomainError && error.code === "ACTOR_FORBIDDEN",
    );
    await assert.rejects(
      () =>
        extractPublishedObservations(
          prisma,
          fake,
          { userId: setup.otherTeacher.id, role: "TEACHER" },
          { assessmentId: graded.assessment.id },
        ),
      (error: unknown) => error instanceof DomainError && error.code === "ASSESSMENT_OWNERSHIP",
    );
    await prisma.user.update({ where: { id: setup.teacher.id }, data: { status: "INACTIVE" } });
    await assert.rejects(
      () =>
        extractPublishedObservations(prisma, fake, setup.teacherActor, {
          assessmentId: graded.assessment.id,
        }),
      (error: unknown) => error instanceof DomainError && error.code === "ACTOR_INACTIVE",
    );
    assert.equal(fake.calls.length, 0);

    await prisma.user.update({ where: { id: setup.teacher.id }, data: { status: "ACTIVE" } });
    const extracted = await extractPublishedObservations(prisma, fake, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    assert.equal(extracted.outcome, "extracted");
    assert.equal(extracted.observations[0]?.status, "PROVISIONAL");
    assert.equal(extracted.observations[0]?.evidenceQuote, ESSAY.slice(0, 18));
    assert.equal(fake.calls.length, 1);
    assert.match(fake.calls[0]?.userPayload ?? "", /UNTRUSTED/);
    assert.doesNotMatch(fake.calls[0]?.userPayload ?? "", /declaredGoals|loginId/);
  });
});

test("status or ownership change during generation does not persist observations", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "WP-HOLD");
    const { graded } = await publishEssay(prisma, setup);
    const hold = new FakeWritingObservationAi();
    hold.nextOutput = observationOutputForText(ESSAY);
    let release!: () => void;
    hold.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inflight = extractPublishedObservations(prisma, hold, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    await waitForCalls(() => hold.calls.length);
    await prisma.assessment.update({
      where: { id: graded.assessment.id },
      data: { status: "AI_DRAFT", publishedAt: null },
    });
    release();
    await assert.rejects(
      () => inflight,
      (error: unknown) => error instanceof DomainError && error.code === "OBSERVATION_STATUS",
    );
    assert.equal(await prisma.writingObservation.count({ where: { assessmentId: graded.assessment.id } }), 0);
  });
});

test("invalid batch rolls back; empty output is no_observations without a placeholder", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "WP-EMPTY");
    const { graded } = await publishEssay(prisma, setup);
    const bad = new FakeWritingObservationAi();
    const end = 12;
    bad.nextOutput = {
      observations: [
        {
          traitId: "WORD_CHOICE",
          kind: "STYLE",
          description: "Một",
          evidence: { quote: ESSAY.slice(0, end), start: 0, end },
        },
        {
          traitId: "WORD_CHOICE",
          kind: "STYLE",
          description: "Hai",
          evidence: { quote: ESSAY.slice(0, end), start: 0, end },
        },
      ],
    };
    await assert.rejects(
      () =>
        extractPublishedObservations(prisma, bad, setup.teacherActor, {
          assessmentId: graded.assessment.id,
        }),
      (error: unknown) => error instanceof DomainError && error.code === "OBSERVATION_DUPLICATE",
    );
    assert.equal(await prisma.writingObservation.count({ where: { assessmentId: graded.assessment.id } }), 0);
    assert.equal(await prisma.writingProfile.count({ where: { studentId: setup.student.id } }), 0);

    const empty = new FakeWritingObservationAi();
    empty.nextOutput = { observations: [] };
    const none = await extractPublishedObservations(prisma, empty, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    assert.equal(none.outcome, "no_observations");
    assert.equal(none.profileVersion, null);
    assert.equal(none.observations.length, 0);
    const again = await extractPublishedObservations(prisma, empty, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    assert.equal(again.outcome, "no_observations");
    assert.equal(empty.calls.length, 2);
  });
});

test("retry is replay: no extra rows, version, or observedAt; terminal statuses stay closed", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "WP-RETRY");
    const { graded } = await publishEssay(prisma, setup);
    const fake = new FakeWritingObservationAi();
    fake.nextOutput = observationOutputForText(ESSAY);
    const first = await extractPublishedObservations(prisma, fake, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    const observedAt = first.observations[0]?.observedAt;
    const version = first.profileVersion;
    await reviewObservationStatus(prisma, setup.teacherActor, {
      observationId: first.observations[0]!.id,
      status: "SUPPORTED",
      expectedProfileVersion: version ?? 0,
    });
    const supported = await prisma.writingObservation.findUniqueOrThrow({
      where: { id: first.observations[0]!.id },
    });
    const afterSupport = await prisma.writingProfile.findUniqueOrThrow({ where: { studentId: setup.student.id } });
    const replay = await extractPublishedObservations(prisma, fake, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    assert.equal(replay.outcome, "replayed");
    assert.equal(fake.calls.length, 1);
    assert.equal(replay.observations.length, 1);
    assert.equal(replay.observations[0]?.status, "SUPPORTED");
    assert.equal(replay.observations[0]?.observedAt, supported.observedAt.toISOString());
    assert.equal(replay.profileVersion, afterSupport.version);
    assert.equal(await prisma.writingObservation.count({ where: { studentId: setup.student.id } }), 1);

    await reviewObservationStatus(prisma, setup.teacherActor, {
      observationId: first.observations[0]!.id,
      status: "INVALIDATED",
      expectedProfileVersion: afterSupport.version,
    });
    const afterInvalid = await extractPublishedObservations(prisma, fake, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    assert.equal(afterInvalid.observations[0]?.status, "INVALIDATED");
    const invalidProfile = await prisma.writingProfile.findUniqueOrThrow({
      where: { studentId: setup.student.id },
    });
    await assert.rejects(
      () =>
        reviewObservationStatus(prisma, setup.teacherActor, {
          observationId: first.observations[0]!.id,
          status: "SUPPORTED",
          expectedProfileVersion: invalidProfile.version,
        }),
      (error: unknown) => error instanceof DomainError && error.code === "OBSERVATION_STATUS",
    );
    const own = await getOwnWritingProfile(prisma, setup.studentActor);
    assert.equal(own.observations.length, 0);
    assert.equal(observedAt, first.observations[0]?.observedAt);
  });
});

test("concurrent extracts share one batch; missing-profile race keeps the winner", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "WP-RACE-A");
    const { graded } = await publishEssay(prisma, setup);
    const holdA = new FakeWritingObservationAi();
    holdA.nextOutput = observationOutputForText(ESSAY);
    let releaseA!: () => void;
    holdA.hold = new Promise<void>((resolve) => {
      releaseA = resolve;
    });
    const holdB = new FakeWritingObservationAi();
    holdB.nextOutput = observationOutputForText(ESSAY);
    const inflightA = extractPublishedObservations(prisma, holdA, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    await waitForCalls(() => holdA.calls.length);
    const inflightB = extractPublishedObservations(prisma, holdB, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    releaseA();
    const [one, two] = await Promise.all([inflightA, inflightB]);
    assert.equal(one.assessmentId, two.assessmentId);
    assert.equal(await prisma.writingObservation.count({ where: { assessmentId: graded.assessment.id } }), 1);
    assert.ok([one.outcome, two.outcome].includes("extracted"));
    assert.ok([one.outcome, two.outcome].includes("replayed") || one.outcome === two.outcome);

    const setup2 = await fixture(prisma, "WP-RACE-B");
    const secondAssignment = await createAssignment(prisma, {
      teacherId: setup2.teacher.id,
      code: "WP-RACE-B2",
      title: "Bản lĩnh 2",
      instructions: "Viết nghị luận.",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "Ngữ liệu.",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const submitted2 = await submitStudentText(prisma, setup2.studentActor, {
      assignmentId: secondAssignment.id,
      text: ESSAY,
    });
    const gradeAi = new FakeAssessmentAi();
    gradeAi.nextOutput = modelOutputForText(ESSAY);
    const graded2 = await assessSubmission(prisma, gradeAi, setup2.teacherActor, {
      submissionId: submitted2.submission.id,
    });
    await publishReviewedAssessment(prisma, setup2.teacherActor, { assessmentId: graded2.assessment.id });
    const { graded: graded1 } = await publishEssay(prisma, setup2);

    const firstHold = new FakeWritingObservationAi();
    firstHold.nextOutput = observationOutputForText(ESSAY);
    let releaseFirst!: () => void;
    firstHold.hold = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const secondAi = new FakeWritingObservationAi();
    secondAi.nextOutput = observationOutputForText(ESSAY);
    const delayed = extractPublishedObservations(prisma, firstHold, setup2.teacherActor, {
      assessmentId: graded1.assessment.id,
    });
    await waitForCalls(() => firstHold.calls.length);
    const winner = await extractPublishedObservations(prisma, secondAi, setup2.teacherActor, {
      assessmentId: graded2.assessment.id,
    });
    assert.equal(winner.outcome, "extracted");
    const goalsBefore = { items: [{ id: "g1", text: "Muốn viết phản đề tự nhiên hơn" }] };
    await prisma.writingProfile.update({
      where: { studentId: setup2.student.id },
      data: { declaredGoals: goalsBefore },
    });
    releaseFirst();
    await assert.rejects(
      () => delayed,
      (error: unknown) => error instanceof VersionConflictError,
    );
    const profile = await prisma.writingProfile.findUniqueOrThrow({ where: { studentId: setup2.student.id } });
    assert.deepEqual(profile.declaredGoals, goalsBefore);
    assert.equal(await prisma.writingObservation.count({ where: { assessmentId: graded1.assessment.id } }), 0);
    assert.equal(await prisma.writingObservation.count({ where: { assessmentId: graded2.assessment.id } }), 1);
  });
});

test("student reads own profile with evidence; resolved leaves practice needs; invalidated stays out of coaching", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "WP-VIEW");
    const { graded } = await publishEssay(prisma, setup);
    const fake = new FakeWritingObservationAi();
    fake.nextOutput = observationOutputForText(ESSAY);
    const extracted = await extractPublishedObservations(prisma, fake, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    const own = await getOwnWritingProfile(prisma, setup.studentActor);
    assert.ok(own.profile);
    assert.equal(own.observations.length, 1);
    assert.equal(own.observations[0]?.evidenceQuote, ESSAY.slice(0, 18));
    assert.equal(own.observations[0]?.assessmentId, graded.assessment.id);
    await assert.rejects(
      () => getOwnWritingProfile(prisma, setup.teacherActor),
      (error: unknown) => error instanceof DomainError && error.code === "ACTOR_FORBIDDEN",
    );

    const afterSupport = await reviewObservationStatus(prisma, setup.teacherActor, {
      observationId: extracted.observations[0]!.id,
      status: "SUPPORTED",
      expectedProfileVersion: extracted.profileVersion ?? 0,
    });
    const resolved = await reviewObservationStatus(prisma, setup.teacherActor, {
      observationId: extracted.observations[0]!.id,
      status: "RESOLVED",
      expectedProfileVersion: afterSupport.version,
    });
    const summary = resolved.summary as {
      practiceNeeds: string[];
      resolvedItems: Array<{ featureKey: string }>;
    };
    assert.equal(summary.practiceNeeds.length, 0);
    assert.equal(summary.resolvedItems.length, 1);
    const context = await getProfileContextForSession(prisma, setup.student.id);
    assert.equal(context.recentObservations.length, 0);
  });
});

test("scoring payload is unchanged by profile updates", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "WP-SCORE");
    const submitted = await submitStudentText(prisma, setup.studentActor, {
      assignmentId: setup.assignment.id,
      text: ESSAY,
    });
    const gradeAi = new FakeAssessmentAi();
    gradeAi.nextOutput = modelOutputForText(ESSAY);
    const first = await assessSubmission(prisma, gradeAi, setup.teacherActor, {
      submissionId: submitted.submission.id,
    });
    await publishReviewedAssessment(prisma, setup.teacherActor, { assessmentId: first.assessment.id });
    const extractAi = new FakeWritingObservationAi();
    extractAi.nextOutput = observationOutputForText(ESSAY);
    await extractPublishedObservations(prisma, extractAi, setup.teacherActor, {
      assessmentId: first.assessment.id,
    });

    const other = await createStudent(prisma, `hs-score-${randomUUID()}`, "B");
    const submitted2 = await submitStudentText(
      prisma,
      { userId: other.id, role: "STUDENT" },
      { assignmentId: setup.assignment.id, text: ESSAY },
    );
    const gradeAi2 = new FakeAssessmentAi();
    gradeAi2.nextOutput = modelOutputForText(ESSAY);
    const second = await assessSubmission(prisma, gradeAi2, setup.teacherActor, {
      submissionId: submitted2.submission.id,
    });
    assert.deepEqual(first.scoringInput, second.scoringInput);
    assertScoringInputIsolated(second.scoringInput);
    assert.doesNotMatch(JSON.stringify(second.scoringInput), /WORD_CHOICE|declaredGoals|writingObservation/);
    assert.doesNotMatch(gradeAi2.calls[0]?.userPayload ?? "", /WORD_CHOICE|declaredGoals/);
  });
});

test("e2e submit → draft → publish → extract → profile → later Socratic turn on another same-genre assignment", async () => {
  await withTestPrisma(async (prisma) => {
    const setup = await fixture(prisma, "WP-E2E-A");
    const openAssignment = await createAssignment(prisma, {
      teacherId: setup.teacher.id,
      code: "WP-E2E-B",
      title: "Bản lĩnh — đề mở",
      instructions: "Viết nghị luận về bản lĩnh người trẻ.",
      genre: "NLXH",
      gradeLevel: 12,
      learningMaterialText: "Ngữ liệu: thành tích cần đi cùng sự trung thực.",
      rubric: SAMPLE_RUBRIC,
      maxScore: "10.00",
      scoreStep: "0.25",
      status: "PUBLISHED",
    });
    const studentSocratic: StudentActor = { userId: setup.student.id, role: "STUDENT" };
    const openSession = await openOrResumeSocraticSession(prisma, {
      actor: studentSocratic,
      assignmentId: openAssignment.id,
    });
    const socraticAi = new FakeSocraticAi();
    const firstTurn = await sendSocraticTurn(prisma, socraticAi, {
      actor: studentSocratic,
      sessionId: openSession.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: 0,
      message: "Em chưa biết mở bài.",
    });
    assert.doesNotMatch(socraticAi.calls[0]?.userPayload ?? "", /WORD_CHOICE|cụm từ cụ thể/);

    const { graded } = await publishEssay(prisma, setup);
    const extractAi = new FakeWritingObservationAi();
    extractAi.nextOutput = observationOutputForText(ESSAY);
    const extracted = await extractPublishedObservations(prisma, extractAi, setup.teacherActor, {
      assessmentId: graded.assessment.id,
    });
    assert.equal(extracted.outcome, "extracted");
    const profile = await getOwnWritingProfile(prisma, setup.studentActor);
    assert.equal(profile.observations[0]?.evidenceQuote, ESSAY.slice(0, 18));
    assert.doesNotMatch(profile.observations[0]?.evidenceQuote ?? "", /Em muốn làm rõ/);

    const secondTurn = await sendSocraticTurn(prisma, socraticAi, {
      actor: studentSocratic,
      sessionId: openSession.sessionId,
      requestId: randomUUID(),
      expectedLastSequence: firstTurn.lastSequence,
      message: "Em muốn nói về trung thực.",
    });
    const laterPayload = socraticAi.calls[1]?.userPayload ?? "";
    assert.match(laterPayload, /cụm từ cụ thể/);
    assert.equal(laterPayload.includes(ESSAY.slice(0, 18)), true);
    assert.match(laterPayload, /Em chưa biết mở bài/);
    assert.equal(secondTurn.lastSequence, firstTurn.lastSequence + 2);

    const submittedSession = await openOrResumeSocraticSession(prisma, {
      actor: studentSocratic,
      assignmentId: setup.assignment.id,
    });
    await assert.rejects(
      () =>
        sendSocraticTurn(prisma, socraticAi, {
          actor: studentSocratic,
          sessionId: submittedSession.sessionId,
          requestId: randomUUID(),
          expectedLastSequence: 0,
          message: "Em hỏi thêm sau khi nộp.",
        }),
      (error: unknown) => error instanceof DomainError && error.code === "SESSION_SUBMITTED",
    );
  });
});
