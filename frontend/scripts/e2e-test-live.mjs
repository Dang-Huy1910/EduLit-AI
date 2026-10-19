import { chromium } from '@playwright/test';
import * as path from 'node:path';

const SCRATCH_DIR = '/home/huydqhe182408/.gemini/antigravity/brain/2f41a9aa-ec68-4594-ba41-5361d81d1e3e/scratch';

async function runLiveTest() {
  console.log('🚀 Khởi động Playwright Chromium...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const context = await browser.newContext({
    viewport: { width: 1366, height: 850 },
    locale: 'vi-VN',
  });

  const page = await context.newPage();

  try {
    // 1. Đăng nhập
    console.log('1️⃣ Đi tới trang đăng nhập...');
    await page.goto('http://localhost:3000/login');
    await page.waitForSelector('#loginId');

    console.log('Điền thông tin tài khoản học sinh nguyen.van.an...');
    await page.fill('#loginId', 'nguyen.van.an');
    await page.fill('#password', 'HocSinh@2024');
    await page.click('button[type="submit"]');

    // Chờ chuyển trang sau đăng nhập
    await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 10000 });
    console.log('✅ Đăng nhập thành công! Trang hiện tại:', page.url());

    // 2. Vào trang Socratic
    console.log('2️⃣ Điều hướng vào trang Socratic...');
    await page.goto('http://localhost:3000/assignments/assign-nlvh-mau-tu-do-dat/socratic');
    await page.waitForSelector('h1');
    await page.waitForTimeout(2000); // Đợi session init

    const title = await page.textContent('h1');
    console.log('✅ Tiêu đề trang:', title?.trim());
    await page.screenshot({ path: path.join(SCRATCH_DIR, '01_socratic_page_loaded.png') });

    // 3. Xem modal đề bài & bài thơ
    console.log('3️⃣ Kiểm tra modal Xem đề bài & Bài thơ...');
    await page.click('button:has-text("Xem đề bài & Bài thơ")');
    await page.waitForSelector('text=Bài thơ: Màu tự do của đất');
    console.log('✅ Modal Đề bài & Bài thơ mở thành công');
    await page.screenshot({ path: path.join(SCRATCH_DIR, '02_reading_modal.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 4. Xem modal Barem Rubric
    console.log('4️⃣ Kiểm tra modal Barem Rubric (4,0đ)...');
    await page.click('button:has-text("Barem Rubric")');
    await page.waitForSelector('text=Barem Rubric (4,0đ)');
    console.log('✅ Modal Barem Rubric mở thành công');
    await page.screenshot({ path: path.join(SCRATCH_DIR, '03_rubric_modal.png') });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // 5. Thêm ý vào dàn ý
    console.log('5️⃣ Kiểm tra thêm ý vào Dàn ý (Outline Canvas)...');
    const addPointButtons = await page.$$('button:has-text("Thêm ý")');
    if (addPointButtons.length > 0) {
      await addPointButtons[0].click();
      await page.waitForSelector('input[placeholder="Nhập ý chính của em..."]');
      await page.fill(
        'input[placeholder="Nhập ý chính của em..."]',
        'Tự do được cảm nhận bằng khứu giác qua ngọn khói rơm rạ gắn liền với cội rễ làng quê.'
      );
      // Dùng exact: true để bấm đúng nút "Thêm" chứ không phải "Thêm ý"
      await page.getByRole('button', { name: 'Thêm', exact: true }).click();
      console.log('✅ Đã bấm nút Thêm ý');
      await page.waitForTimeout(1500); // Chờ save
    }
    await page.screenshot({ path: path.join(SCRATCH_DIR, '04_outline_point_added.png') });

    // 6. Rà soát dàn ý
    console.log('6️⃣ Kiểm tra thao tác "Rà soát dàn ý"...');
    const reviewBtn = await page.waitForSelector('button:has-text("Rà soát dàn ý")');
    await reviewBtn.click();
    console.log('Đã bấm Rà soát dàn ý, đang chờ hệ thống xử lý...');
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(SCRATCH_DIR, '05_after_review.png') });
    console.log('✅ Hoàn tất rà soát dàn ý');

    // 7. Gửi tin nhắn chat
    console.log('7️⃣ Kiểm tra gửi tin nhắn Socratic...');
    const chatInput = await page.waitForSelector('input[placeholder*="Nhập câu hỏi"]');
    await chatInput.fill('Em muốn tìm hiểu thêm về ngọn khói rơm rạ ở khổ 1.');
    await page.click('button[type="submit"]:has-text("Gửi")');
    console.log('Đã gửi tin nhắn, đang chờ phản hồi từ trợ lý Socratic...');

    // Đợi phản hồi hoàn tất từ AI (không còn dòng "đang phân tích và soạn phản hồi")
    await page.waitForFunction(
      () => !document.body.innerText.includes('Trợ lý Socratic đang phân tích'),
      { timeout: 30000 }
    );
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(SCRATCH_DIR, '06_chat_conversation.png') });
    console.log('✅ Đã chụp ảnh màn hình cuộc trò chuyện có cả tin học sinh và phản hồi trợ lý AI');

    // 8. Kiểm tra nút "Thêm vào dàn ý" từ gợi ý của AI
    console.log('8️⃣ Kiểm tra nút "Thêm vào dàn ý" từ gợi ý của trợ lý AI...');
    const transferBtn = await page.waitForSelector('button:has-text("Thêm vào dàn ý")');
    if (transferBtn) {
      console.log('Đã tìm thấy nút "Thêm vào dàn ý" trên bóng chat AI, tiến hành click...');
      await transferBtn.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: path.join(SCRATCH_DIR, '08_outline_transfer_success.png') });
      console.log('✅ Đã bấm nút "Thêm vào dàn ý" và cập nhật vào Dàn ý');
    }

    // 9. Chụp thêm ảnh chi tiết toàn trang
    await page.screenshot({ path: path.join(SCRATCH_DIR, '07_full_socratic_interaction.png'), fullPage: true });

    console.log('🎉 TOÀN BỘ CÁC BƯỚC TEST TRỰC TIẾP TRÊN GIAO DIỆN ĐÃ HOÀN TẤT!');
  } catch (err) {
    console.error('❌ Lỗi trong quá trình test giao diện:', err);
    await page.screenshot({ path: path.join(SCRATCH_DIR, 'error_screenshot.png') });
  } finally {
    await browser.close();
  }
}

runLiveTest();
