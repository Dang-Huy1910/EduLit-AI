# Evaluation Socratic v1

Bộ 12 tình huống tiếng Việt để đánh giá hành vi sư phạm của `gemini-2.5-flash` với prompt `socratic-system.v1`. Đây không phải kiểm tra phần mềm. Tests dùng fake adapter không chứng minh chất lượng model.

## Cách đọc

Mỗi case trong `cases.v1.json` có `expectedBehavior` và `rubric`. Chấm thủ công hoặc bán tự động theo rubric, không so khớp một câu chữ duy nhất.

## Giới hạn

- Guardrail phần mềm (số câu, câu hỏi cuối, schema, ID) là lớp chặn thô.
- Regex không phát hiện mọi trường hợp viết hộ.
- Live smoke chỉ chứng minh gọi được model và structured output, không phải nghiệm thu chất lượng.
