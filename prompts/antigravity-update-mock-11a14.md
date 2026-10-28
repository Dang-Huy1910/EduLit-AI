# Prompt cho Antigravity — cập nhật mock lớp 11A14

> **Prompt lịch sử — rà lại 2026-10-28:** Nội dung giao việc bên dưới phản ánh thời điểm tạo, không phải hiện trạng hay lệnh vận hành hiện tại. Dữ liệu lớp/ảnh demo đã dời sang `backend/demo/`; các file store/mock prototype đã bỏ. Backend hiện dùng Python theo [ADR-0004](../docs/architecture/decisions/0004-python-monolith.md); không áp dụng nguyên trạng yêu cầu scaffold, tạo nhánh hoặc khôi phục mock trong prompt này.

Sao chép toàn bộ nội dung bên dưới vào Antigravity khi mở repository EduLit-AI. Các đường dẫn nguồn là đường dẫn trên máy hiện tại.

---

Hãy trực tiếp cập nhật code và dữ liệu mock trong dự án EduLit-AI theo các yêu cầu dưới đây. Đọc repository, thực hiện thay đổi, chạy kiểm tra và kiểm tra giao diện; không dừng ở việc lập kế hoạch hoặc hướng dẫn tôi tự làm.

## 1. Nguồn dữ liệu và phạm vi

- Repository: `/home/huydqhe182408/EduLit-AI`.
- Excel: `/home/huydqhe182408/Downloads/DS học sinh 11A14 nộp tiền BHYT.xlsx`.
- Ảnh bài làm: `/home/huydqhe182408/Downloads/dshs`.
- Thay toàn bộ danh sách học sinh đang dùng trong mock bằng **41 học sinh lớp 11A14, THPT Đan Phượng** trong Excel. Giữ nguyên chính tả, dấu tiếng Việt và thứ tự STT trong Excel.
- Tài khoản học sinh mặc định và tài khoản học sinh đang dùng: **Đỗ Đăng An, STT 1**. Tên này đã được người dùng xác nhận theo Excel; không dùng “Đỗ Đặng An”.
- Tài khoản giáo viên: **Đặng Hoàng Loan**. Những câu xưng hô có thể dùng “Cô Đặng Hoàng Loan”, còn trường `name` dùng “Đặng Hoàng Loan”.
- Giữ thiết kế, bố cục, đề bài, ngữ liệu, rubric và các chức năng hiện có, chỉ điều chỉnh những gì cần để đồng bộ danh tính, lớp, bài nộp, ảnh và OCR. Không mở rộng sang xây backend hay dịch vụ OCR trực tuyến.
- Kiểm tra thay đổi chưa commit trước khi sửa; bảo toàn những thay đổi không liên quan của người dùng. Không sửa Excel và thư mục ảnh nguồn.

## 2. Đọc Excel và ánh xạ chính xác theo STT

Workbook có hai sheet cùng danh sách 41 học sinh:

- Sheet `11A14`: tiêu đề ở dòng 7; dữ liệu ở dòng 8–48. Cột A = STT, C = Họ tên, G = Lớp.
- Sheet `Sheet1`: tiêu đề ở dòng 3; dữ liệu ở dòng 4–44. Cột A = STT, B = Họ tên.

Đọc lại file để xác nhận. Lấy sheet `11A14` làm nguồn chính, đối chiếu với `Sheet1`. Chỉ cần nhập STT, họ tên và lớp cho yêu cầu này. Nếu thiếu thư viện đọc Excel, có thể dùng Python `zipfile` + XML hoặc cài công cụ phù hợp cho bước nhập dữ liệu, không thêm thư viện Excel vào frontend runtime chỉ để đọc mock.

Quy tắc bắt buộc: **học sinh STT n ↔ toàn bộ ảnh trong thư mục `dshs/n/`**. Không ánh xạ bằng thứ tự liệt kê thư mục của hệ điều hành, thứ tự bảng chữ cái tên học sinh hay thứ tự các tên file trên toàn bộ thư mục gốc. Sắp xếp STT theo số: 1, 2, 3, …, 41.

Danh sách và số ảnh đã kiểm kê, dùng để kiểm tra chéo:

| STT / thư mục | Họ tên theo Excel | Số ảnh |
| --- | --- | --- |
| 1 | Đỗ Đăng An | 2 |
| 2 | Nguyễn Thu An | 2 |
| 3 | Nguyễn Thị Ngọc Anh | 3 |
| 4 | Bùi Hà Chi | 2 |
| 5 | Trần Quỳnh Chi | 2 |
| 6 | Trần Diệp Diệp | 2 |
| 7 | Nguyễn Trung Dũng | 2 |
| 8 | Đỗ Quang Duy | 3 |
| 9 | Nguyễn Thu Hà | 3 |
| 10 | Nguyễn Thanh Hằng | 2 |
| 11 | Hà Bảo Hân | 2 |
| 12 | Đông Khánh Huyền | 2 |
| 13 | Tạ Thị Thu Hương | 2 |
| 14 | Bùi Thị Ngọc Khuê | 4 |
| 15 | Chu Nhật Linh | 2 |
| 16 | Lê Nguyễn Diệu Linh | 2 |
| 17 | Nguyễn Ngọc Linh | 2 |
| 18 | Trần Hà Linh | 1 |
| 19 | Trần Phương Linh | 2 |
| 20 | Phí Nguyên Mạnh | 2 |
| 21 | Nguyễn Hoa Tuệ Mẫn | 2 |
| 22 | Nguyễn Viết Bảo Minh | 3 |
| 23 | Nguyễn Hà My | 2 |
| 24 | Nguyễn Thị Ngân | 2 |
| 25 | Cao Thị Ánh Ngọc | 2 |
| 26 | Trần Vũ Thanh Ngọc | 3 |
| 27 | Đỗ Văn Nguyên | 3 |
| 28 | Nguyễn Ngọc Mẫn Nhi | 3 |
| 29 | Phạm Yến Nhi | 3 |
| 30 | Trần Yến Nhi | 3 |
| 31 | Bùi Hồng Nhung | 1 |
| 32 | Đoàn Nguyễn Mai Như | 2 |
| 33 | Trần Mai Phương | 3 |
| 34 | Nguyễn Thị Phượng | 2 |
| 35 | Phạm Minh Tâm | 2 |
| 36 | Đàm Thị Thu | 1 |
| 37 | Hoàng Thị Trang | 1 |
| 38 | Nguyễn Minh Trang | 1 |
| 39 | Nguyễn Thùy Trang | 2 |
| 40 | Lê Thuỳ Vân | 2 |
| 41 | Đặng Gia Vinh | 2 |

Tổng cộng **41 thư mục, 89 ảnh JPG**. Giữ đúng các tên dễ bị tự sửa như “Đông Khánh Huyền”, “Trần Diệp Diệp”, “Nguyễn Hoa Tuệ Mẫn”, “Lê Thuỳ Vân”. Không lọc bỏ học sinh chỉ vì cột trạng thái khác “Đang học”.

Tạo nguồn dữ liệu lớp dùng chung, có STT tường minh, ID ổn định và duy nhất. Có thể dùng `user-student-11a14-001` và mã nội bộ mock `VN-11A14-001` cho STT 1, tương tự đến 041. Đây là mã nội bộ được tạo cho ứng dụng, không phải mã định danh Bộ GD&ĐT. Nếu cần email để giữ schema, dùng email demo nhất quán, không coi đó là email thật lấy từ Excel.

## 3. Nhập ảnh và xây manifest

- Copy đầy đủ ảnh vào `backend/demo/submissions/`, theo cấu trúc hiện có hoặc một cấu trúc rõ ràng theo assignment và student. Có thể đổi tên bản copy thành `page-1.jpg`, `page-2.jpg`, …; không sửa bản gốc.
- Lưu đường dẫn gốc tương đối, STT, trang đích và hash trong manifest hoặc tệp đối chiếu để truy ngược từng ảnh về nguồn. Nếu chọn tên file đích mới, ghi rõ ánh xạ nguồn → đích.
- Trong từng thư mục, dùng timestamp ở đầu tên file làm thứ tự ban đầu, sau đó **mở ảnh kiểm tra nội dung nối tiếp và số trang viết tay** để xác nhận thứ tự đọc. Không mặc định timestamp luôn là thứ tự trang đúng. Ghi lại các trường hợp không xác định chắc chắn.
- Số trang thực tế từ 1 đến 4. Không cắt thành hai trang, nhân đôi ảnh để đủ hai trang, hay bỏ bớt trang.
- `pageIndex`, thứ tự ảnh, caption, số trang và `transcriptionByPage` phải nhất quán. Caption dùng đúng tên học sinh và “Trang x/y”. Dung lượng ảnh lấy theo tệp thực tế.
- Runtime chỉ dùng URL tài nguyên trong dự án, không tham chiếu trực tiếp `/home/.../Downloads`, `file://` hay chứa cả bộ ảnh dưới dạng base64 trong store.

**Các ảnh trùng đã được kiểm tra bằng hash:**

- Thư mục 27 và 28 trùng cả 3 ảnh.
- Thư mục 29 và 30 trùng cả 3 ảnh.
- Một ảnh trong thư mục 33 trùng ảnh duy nhất của thư mục 38, tên file `1792242557509_4267523568992293385_4267523568992293385_5405b21274111a8c2d3f898874efff70.jpg`.
- Tổng 89 tệp nhưng có 82 nội dung ảnh khác nhau.

Hãy xác nhận lại và ghi vào báo cáo dữ liệu nguồn. **Vẫn giữ ánh xạ học sinh theo thư mục STT do người dùng chỉ định**, không tự xóa, đổi chủ bài làm hoặc gộp học sinh vì ảnh trùng. Nếu tên viết trên ảnh khác tên Excel, ghi nhận khác biệt và giữ ánh xạ STT. Có thể tái sử dụng bản chép của ảnh trùng sau khi xác nhận hash, nhưng giữ đủ bản ghi trang thuộc từng học sinh.

## 4. Chép OCR từ chính từng ảnh

Đây là phần bắt buộc, không thay bằng văn mẫu hoặc nội dung sinh theo đề bài:

1. Mở và đọc tất cả ảnh, chép nguyên văn nội dung nhìn thấy theo từng trang. OCR tự động nếu có chỉ là bước hỗ trợ, cần đối chiếu lại bằng ảnh.
2. Giữ nguyên chữ, dấu tiếng Việt, chính tả, cách dùng từ, dấu câu, câu trích dẫn và xuống dòng nhìn thấy. Không sửa lỗi bài làm, không viết lại cho hay hơn và không tự thay câu trích thơ bằng bản chuẩn của tác phẩm.
3. Xử lý phần gạch xóa/chèn bổ sung theo nội dung cuối cùng đọc được của người viết; phần không rõ phải đánh dấu, không đoán. Có thể lưu ghi chú gạch xóa riêng nếu cần, không thêm lời giải thích vào nội dung bài như thể học sinh đã viết.
4. Nếu không đọc được, dùng `[không đọc rõ]` tại đúng vị trí và ghi danh sách cần rà soát gồm STT, tên file, trang, dòng. Không tuyên bố OCR chính xác hoàn toàn khi còn chỗ chưa xác minh.
5. Lưu bản chép có cấu trúc cho từng ảnh vào dữ liệu mock, tương thích `transcriptionByPage`. Mỗi trang ảnh phải có đúng bản chép của trang đó. Không nối toàn bài rồi dùng chung một đoạn cho mọi tab.
6. Màn OCR, màn kết quả và màn giáo viên xem chi tiết cùng đọc một nguồn bản chép. Chỉnh sửa và lưu một dòng phải cập nhật đúng submission/trang/dòng, và phản ánh khi quay lại màn xem.
7. Cờ OCR và vị trí dòng cần kiểm tra phải xuất phát từ bài mới. Bỏ các đoạn lỗi minh họa cố định của bài cũ. Không tự ghi “Độ chính xác 98%” nếu không có phép đo.

Ảnh/bản chép cần được tra theo **assignmentId và studentId**. Không dùng ảnh, OCR hay nhận xét của Đỗ Đăng An làm fallback cho học sinh khác, hoặc gán bộ ảnh này cho các bài lịch sử có đề khác. Nếu dữ liệu không có, hiển thị trạng thái thiếu dữ liệu đúng đối tượng.

Nếu công cụ không đọc được ảnh hoặc còn đoạn chưa đọc rõ, vẫn hoàn thành các phần độc lập, ghi rõ phần còn thiếu và trạng thái cần rà soát; không điền văn bản tự tạo để báo hoàn tất.

## 5. Đồng bộ mock, tài khoản và toàn bộ giao diện

Các vị trí đã xác định trong code, hãy đọc và kiểm tra mọi nơi tham chiếu trước khi sửa:

- `frontend/src/lib/types.ts`.
- Dữ liệu lớp prototype cũ đã bỏ; roster seed hiện ở `backend/demo/roster_11a14.json`.
- `backend/demo/submissionsManifest.ts`: ảnh, bản chép và bài nộp khởi tạo.
- Module dữ liệu/thống kê mock cũ đã bỏ; thống kê hiện do `backend/app/services/stats_engine.py` tính từ dữ liệu backend.
- Hồ sơ mẫu prototype đã bỏ; UI hiện ở `frontend/src/features/writing-profile/`, dữ liệu từ API.
- `frontend/src/lib/store.ts`: `currentUser`, `setRole`, `switchDemoUser`, `START_SUBMISSIONS`, các mốc demo, reset, nạp ảnh, nộp bài, tra submission, lưu OCR và persist.
- `frontend/src/components/StudentShell.tsx`, `TeacherShell.tsx`, `FloatingChatWidget.tsx`.
- `frontend/src/features/assignments/StudentAssignmentsView.tsx`, `TeacherAssignmentsView.tsx`.
- `frontend/src/features/assessment/EvaluationResultView.tsx`.
- Các trang trong `frontend/src/app/`: login, profile, chatbot, materials, reports, reports chi tiết từng học sinh và `assignments/[id]` gồm submit, ocr, result, socratic.

Yêu cầu hành vi:

- Tài khoản học sinh mặc định là Đỗ Đăng An; đăng nhập nhanh học sinh, đổi vai trò sang học sinh và reset demo đều đưa về đúng tài khoản này. Lần mở sau cập nhật phải loại trạng thái tài khoản cũ. Chuyển vai trò giáo viên dùng Đặng Hoàng Loan.
- Đổi đồng bộ tên, mã nội bộ, avatar initials, lời chào, toast, tooltip, caption, hồ sơ, chatbot, nhận xét và các chỗ hardcode. Nguồn tên học sinh trong UI lấy từ user/roster thay vì chuỗi ghi tay.
- Đổi lớp và khối trong metadata và UI thành 11A14/khối 11; trường là THPT Đan Phượng. Không thay toàn cục số 12 hoặc 40 vì chúng có thể thuộc nội dung khác.
- Danh sách lớp có đủ 41 học sinh theo STT. Báo cáo hiển thị đúng sĩ số từ roster; đếm bài nộp và bài đã chấm theo assignment đang xem, không cộng bài lịch sử. Học sinh chưa nộp vẫn xuất hiện với trạng thái tương ứng.
- Ở mốc demo hoàn tất, cả 41 học sinh có bài nộp cho bài tập chính từ bộ ảnh tương ứng. Nếu mốc bắt đầu cần để Đỗ Đăng An tự nộp trong luồng demo, giữ trạng thái chưa nộp của em ở mốc đó và thống kê đúng; không ghi cứng 41/41 cho mọi mốc.
- Đổi hàm `loadDemoBuiHaMyPages` thành hàm nạp ảnh theo học sinh/bài tập hiện tại, cập nhật tất cả nơi gọi. Khi đổi học sinh, ảnh đã nạp, OCR, danh sách bài đã nộp và trạng thái xác nhận phải thuộc đúng học sinh, không mang dữ liệu của phiên trước sang.
- Bỏ các tham chiếu fallback `user-student-48`, `sub-bui-ha-my` và các ID học sinh cũ trong luồng chạy. ID bài nộp cần duy nhất theo assignment + student để các bài không ghi đè nhau.
- Sửa mọi giả định “mỗi bài đúng 2 trang”: câu hướng dẫn, thông báo đồng bộ, tab OCR, nút xem OCR, mô tả báo cáo, kiểm tra số trang và khu vực xem ảnh trong kết quả. Tất cả dùng số trang thực tế, hỗ trợ trọn vẹn 1–4 trang.
- Thay danh tính trong các bài lịch sử nếu chúng còn được dùng cho hồ sơ mock. Không gán ảnh bài hiện tại cho đề khác; không chuyển nguyên trích dẫn/nhận xét riêng của học sinh cũ thành minh chứng cho người mới. Dữ liệu điểm/hồ sơ lịch sử còn giữ để minh họa phải thể hiện đúng tính chất mock; phần chưa có dữ liệu tương ứng để trạng thái chờ hoặc thiếu dữ liệu. Không tự mở rộng sang chấm lại cả lớp như kết quả thật.
- Thống kê và nhận xét tổng hợp không được tiếp tục lấy ba học sinh cũ hoặc các ID cũ làm căn cứ. Trung bình và phân bố điểm chỉ dùng các bài đã chấm đúng assignment.
- Store hiện persist bằng Zustand, key `edulit-app-v1`, dùng `sessionStorage`; reset còn xóa key này trong `localStorage`. Thêm version/migration hoặc đổi key có kiểm soát để dữ liệu cũ không ghi đè roster, user, ảnh và OCR mới. Chỉ xử lý key của EduLit; không gọi `sessionStorage.clear()`/`localStorage.clear()`. Giữ các tùy chọn UI không liên quan khi hợp lý.

## 6. Kiểm tra và bàn giao

Thực hiện kiểm tra dữ liệu và giao diện phù hợp với thay đổi:

- Đúng 41 học sinh, STT liên tục 1–41, tên khớp Excel; không trùng ID hoặc mã nội bộ.
- Đủ 89 tham chiếu trang ảnh theo đúng số ảnh từng thư mục. Kiểm tra nguồn → đích bằng hash và bảo toàn các trường hợp ảnh trùng đã nêu.
- Mọi URL ảnh trỏ đến tệp thực sự tồn tại; manifest, pageIndex, caption và bản chép khớp từng trang. Kiểm tra cấu trúc tự động không thay thế việc đọc ảnh để xác minh OCR.
- Kiểm tra trong trình duyệt: đăng nhập Đỗ Đăng An → nạp đúng 2 ảnh thư mục 1 → nộp → đối chiếu từng trang OCR → sửa/lưu một dòng → xem kết quả; chuyển sang Đặng Hoàng Loan → mở báo cáo → xem chi tiết đúng bài của em.
- Kiểm tra cả bài 1 trang (STT 18 hoặc 31), 3 trang (STT 3) và 4 trang (STT 14). Khi chuyển học sinh hoặc bài tập, dữ liệu không lẫn nhau; danh sách không chỉ còn 3 học sinh cũ.
- Kiểm tra refresh, reset và cả hai mốc demo, kể cả khi trình duyệt có dữ liệu persist phiên cũ.
- Tìm các tên/ID/lớp cũ trong mã runtime để sửa chỗ còn sót, không xóa tên tác giả, tác phẩm hoặc nội dung không liên quan.
- Chạy TypeScript và build trong `frontend` bằng công cụ dự án đang dùng, ví dụ `npx tsc --noEmit` và `npm run build`. Đọc script thực tế trước khi chạy; báo lỗi hoặc giới hạn môi trường nếu có. Không tự nhận đã kiểm tra trình duyệt khi chỉ kiểm tra code.

Bàn giao code và asset đã cập nhật, kèm báo cáo ngắn gồm:

1. Các tệp/nhóm chức năng đã đổi và cách tái tạo dữ liệu từ nguồn.
2. Bảng ánh xạ STT → học sinh → file nguồn → ảnh đích → trang OCR, có thể để trong một tệp riêng.
3. Số học sinh, số ảnh, số trang đã đối chiếu OCR; các trang/dòng còn chưa đọc rõ và các trường hợp nguồn trùng hoặc mâu thuẫn.
4. Các lệnh kiểm tra đã chạy, kết quả và những luồng giao diện đã thực sự thử.

Chỉ báo hoàn tất phần OCR khi đã đối chiếu đầy đủ các trang; mọi phần chưa xác minh phải được liệt kê rõ.
