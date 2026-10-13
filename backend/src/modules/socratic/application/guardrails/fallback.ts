import type { AssignmentSnapshot } from "../../../assignments/domain/rubric.js";
import type { SocraticModelOutput } from "../../domain/output.js";
import { validateSocraticOutput } from "./validate-socratic-output.js";

const FALLBACK_BY_GENRE: Record<string, string[]> = {
  NLXH: [
    "Thầy/Cô chưa dùng được câu trả lời vừa rồi vì nó chưa đúng cách hỏi gợi mở.",
    "Em hãy nêu một ý em tự nghĩ, gắn với vấn đề xã hội trong đề và ngữ liệu đã cho.",
    "Em muốn làm rõ luận điểm nào trước?",
  ],
  NLVH: [
    "Thầy/Cô chưa dùng được câu trả lời vừa rồi vì nó chưa đúng cách hỏi gợi mở.",
    "Em hãy chọn một chi tiết trong ngữ liệu mà em thấy đáng viết thành luận điểm.",
    "Chi tiết nào em muốn phân tích trước?",
  ],
};

const FALLBACK_DEFAULT = [
  "Thầy/Cô chưa dùng được câu trả lời vừa rồi vì nó chưa đúng cách hỏi gợi mở.",
  "Em hãy nêu một ý ngắn em tự nghĩ, bám đề và ngữ liệu của phiên này.",
  "Em muốn bắt đầu từ ý nào?",
];

export function fallbackSocraticOutput(snapshot: AssignmentSnapshot): SocraticModelOutput {
  const sentences = FALLBACK_BY_GENRE[snapshot.genre] ?? FALLBACK_DEFAULT;
  const output: SocraticModelOutput = {
    replySentences: sentences,
    focusCriterionIds: [],
  };
  return validateSocraticOutput(output, snapshot).output;
}
