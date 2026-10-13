import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import argon2 from "argon2";
import { DEMO_ASSIGNMENTS } from "../../prisma/demo-ids.js";
import { seedDemoDatabase } from "../../prisma/seed-demo-logic.js";
import { LocalPrivateStorage } from "../../src/infrastructure/storage/local-private-storage.js";
import { withTestPrisma } from "../helpers/db.js";
import { TEST_PASSWORD } from "../helpers/http.js";

test("seed:demo is additive, idempotent, and does not overwrite edited demo rows", async () => {
  await withTestPrisma(async (prisma) => {
    const storageRoot = await mkdtemp(path.join(tmpdir(), "edulit-demo-seed-"));
    try {
      const passwordHash = await argon2.hash(TEST_PASSWORD, { type: argon2.argon2id });
      const storage = new LocalPrivateStorage(storageRoot);
      await seedDemoDatabase(prisma, passwordHash, storage);
      const first = await snapshot(prisma);
      assert.equal(first.demoAssignments, 8);
      assert.ok(first.users >= 12);
      assert.equal(first.progressCases, 21);
      await prisma.assignment.update({
        where: { id: DEMO_ASSIGNMENTS.nlxhDraft },
        data: { title: "Nháp đã sửa tay, seed lần hai không ghi đè" },
      });
      await seedDemoDatabase(prisma, passwordHash, storage);
      const second = await snapshot(prisma);
      assert.equal(second.users, first.users);
      assert.equal(second.demoAssignments, first.demoAssignments);
      assert.equal(second.progressCases, first.progressCases);
      assert.equal(second.drafts, first.drafts);
      assert.equal(second.submissions, first.submissions);
      assert.equal(second.assessments, first.assessments);
      assert.equal(second.observations, first.observations);
      const kept = await prisma.assignment.findUniqueOrThrow({ where: { id: DEMO_ASSIGNMENTS.nlxhDraft } });
      assert.equal(kept.title, "Nháp đã sửa tay, seed lần hai không ghi đè");
    } finally {
      await rm(storageRoot, { recursive: true, force: true });
    }
  });
});

async function snapshot(prisma: Parameters<Parameters<typeof withTestPrisma>[0]>[0]) {
  const [users, demoAssignments, progressCases, drafts, submissions, assessments, observations] = await Promise.all([
    prisma.user.count(),
    prisma.assignment.count({ where: { code: { startsWith: "DEMO-" } } }),
    prisma.assignmentProgress.count(),
    prisma.submissionDraft.count(),
    prisma.submission.count(),
    prisma.assessment.count(),
    prisma.writingObservation.count(),
  ]);
  return { users, demoAssignments, progressCases, drafts, submissions, assessments, observations };
}
