import assert from "node:assert/strict";
import { test } from "node:test";
import { SEED_TEXTS, seedDatabase } from "../../prisma/seed-logic.js";
import { SEED_IDS } from "../../prisma/seed-ids.js";
import { withTestPrisma } from "../helpers/db.js";

test("seed is idempotent and does not overwrite user edits", async () => {
  await withTestPrisma(async (prisma) => {
    await seedDatabase(prisma, "hash-v1");
    await seedDatabase(prisma, "hash-v2");

    const users = await prisma.user.findMany({ orderBy: { loginId: "asc" } });
    assert.equal(users.length, 3);
    const teacher = users.find((user) => user.loginId === "dang.loan");
    assert.equal(teacher?.passwordHash, "hash-v1");
    assert.equal(teacher?.role, "TEACHER");

    await prisma.assignment.update({
      where: { id: SEED_IDS.assignmentNlxh },
      data: { title: "Tiêu đề giáo viên đã sửa" },
    });
    await prisma.user.update({
      where: { id: SEED_IDS.studentMy },
      data: { displayName: "Hà My (đã sửa)" },
    });
    await seedDatabase(prisma, "hash-v3");

    const assignment = await prisma.assignment.findUniqueOrThrow({
      where: { id: SEED_IDS.assignmentNlxh },
    });
    assert.equal(assignment.title, "Tiêu đề giáo viên đã sửa");
    const student = await prisma.user.findUniqueOrThrow({ where: { id: SEED_IDS.studentMy } });
    assert.equal(student.displayName, "Hà My (đã sửa)");
    assert.equal(student.passwordHash, "hash-v1");

    assert.equal(await prisma.submission.count(), 3);
    assert.equal(await prisma.assessment.count(), 3);
    assert.equal(await prisma.writingObservation.count(), 4);
    assert.equal(await prisma.writingProfile.count(), 2);

    const myProfile = await prisma.writingProfile.findUniqueOrThrow({
      where: { studentId: SEED_IDS.studentMy },
    });
    const anProfile = await prisma.writingProfile.findUniqueOrThrow({
      where: { studentId: SEED_IDS.studentAn },
    });
    const myIds = new Set(myProfile.observationIds as string[]);
    const anIds = new Set(anProfile.observationIds as string[]);
    for (const id of myIds) {
      assert.equal(anIds.has(id), false);
    }

    const observation = await prisma.writingObservation.findUniqueOrThrow({
      where: { id: SEED_IDS.observationMyNlvhStyle },
    });
    assert.equal(SEED_TEXTS.myNlvh.slice(observation.evidenceStart, observation.evidenceEnd), observation.evidenceQuote);
    assert.ok(observation.evidenceQuote.includes("trữ tình"));
  });
});
