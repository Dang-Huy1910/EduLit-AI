# Evaluation hồ sơ văn phong v1

Bộ tình huống tiếng Việt để giáo viên đối chiếu output `gemini-2.5-flash` với prompt `writing-profile-system.v1`. Đây không phải kiểm tra phần mềm. Tests dùng fake adapter không chứng minh chất lượng nhận xét hay cá nhân hóa.

## Cách đọc

Mỗi case trong `cases.v1.json` có bài nguồn, thể loại, `teacherReference` (quote/genre kỳ vọng) và `schemaChecks`. So khớp schema/evidence bằng validator; mức phù hợp nhận xét do giáo viên đối chiếu, không lấy một live smoke làm nghiệm thu.

## Giới hạn

- Schema, taxonomy, UTF-16 quote là lớp chặn thô.
- Không khẳng định hồ sơ hội tụ, phần trăm tin cậy, hay 'giữ đúng văn phong' từ fake tests hoặc một lần gọi model.
