# Evaluation chấm bài v1

Bộ tình huống tiếng Việt để giáo viên đối chiếu output `gemini-2.5-flash` với prompt `assessment-system.v1`. Đây không phải kiểm tra phần mềm. Tests dùng fake adapter không chứng minh chất lượng chấm.

## Cách đọc

Mỗi case trong `cases.v1.json` có bài nộp, rubric rút gọn, `teacherReference` (điểm/ghi chú kỳ vọng) và `schemaChecks`. So khớp schema/evidence bằng validator; mức phù hợp chấm do giáo viên đối chiếu, không lấy một live smoke làm nghiệm thu.

## Giới hạn

- Schema, score step, UTF-16 quote là lớp chặn thô.
- Không khẳng định chất lượng chấm đạt khi chỉ có fake tests hoặc một lần gọi model.
