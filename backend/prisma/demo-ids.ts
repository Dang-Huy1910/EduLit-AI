import { createHash } from "node:crypto";

/** Stable UUIDv4-shaped ids for the additive demo namespace. */
export function demoUuid(name: string): string {
  const hex = createHash("sha256").update(`edulit-demo-v1:${name}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export const DEMO_TEACHER_2 = demoUuid("teacher:pham.thuha");
export const DEMO_STUDENTS = {
  quan: demoUuid("student:tran.minhquan"),
  thuong: demoUuid("student:le.thuong"),
  linh: demoUuid("student:pham.linh"),
  nam: demoUuid("student:hoang.nam"),
  ha: demoUuid("student:vo.ha"),
  khoa: demoUuid("student:dang.khoa"),
  trang: demoUuid("student:bui.trang"),
  duc: demoUuid("student:ngo.duc"),
  yen: demoUuid("student:do.yen"),
  son: demoUuid("student:mai.son"),
} as const;

export const DEMO_ASSIGNMENTS = {
  nlxh10: demoUuid("assignment:DEMO-NLXH-10"),
  nlxh11: demoUuid("assignment:DEMO-NLXH-11"),
  nlxh12: demoUuid("assignment:DEMO-NLXH-12"),
  nlvh12: demoUuid("assignment:DEMO-NLVH-12"),
  nlxhNext: demoUuid("assignment:DEMO-NLXH-NEXT"),
  nlxhDraft: demoUuid("assignment:DEMO-NLXH-DRAFT"),
  nlvhDraft: demoUuid("assignment:DEMO-NLVH-DRAFT"),
  nlxhClosed: demoUuid("assignment:DEMO-NLXH-CLOSED"),
} as const;
