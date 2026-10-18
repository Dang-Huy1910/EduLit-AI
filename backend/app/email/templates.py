from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class EmailMessage:
    subject: str
    text_body: str
    html_body: str


def _escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )


def _base_template(title: str, preheader: str, content_html: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{_escape(title)}</title>
  <!--[if mso]>
  <style type="text/css">
    body, table, td {{font-family: Arial, Helvetica, sans-serif !important;}}
  </style>
  <![endif]-->
</head>
<body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <!-- Preheader preview text for inbox -->
  <div style="display: none; max-height: 0px; overflow: hidden; font-size: 1px; line-height: 1px; color: #fff; opacity: 0;">
    {_escape(preheader)}
  </div>
  
  <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f1f5f9; padding: 32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 560px; background-color: #ffffff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #e2e8f0;">
          <!-- Brand Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #006874 0%, #0f4c5c 100%); background-color: #006874; padding: 32px 24px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: 0.5px;">EduLit-AI</h1>
              <p style="margin: 6px 0 0; color: #ccfbf1; font-size: 13px; font-weight: 500;">Trường THPT Đan Phượng • Nền tảng học tập thông minh</p>
            </td>
          </tr>
          <!-- Body Content -->
          <tr>
            <td style="padding: 32px 28px 24px; color: #334155; font-size: 15px; line-height: 1.6;">
              {content_html}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 28px; background-color: #f8fafc; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 12px; line-height: 1.5;">
              <p style="margin: 0 0 6px;">Email này được gửi tự động từ hệ thống <strong>EduLit-AI</strong> — Trường THPT Đan Phượng.</p>
              <p style="margin: 0; color: #94a3b8;">Vui lòng không trả lời trực tiếp email này. Nếu có thắc mắc, vui lòng liên hệ giáo viên quản trị.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def verification_email(display_name: str, verify_url: str) -> EmailMessage:
    name = display_name.strip() or "bạn"
    subject = "Xác minh email tài khoản EduLit-AI"
    text = (
        f"Xin chào {name},\n\n"
        "Em vừa đăng ký tài khoản học sinh trên EduLit-AI. "
        "Hãy mở liên kết sau để xác minh email. Liên kết chỉ dùng một lần và sẽ hết hạn sau 24 giờ.\n\n"
        f"{verify_url}\n\n"
        "Nếu em không đăng ký, hãy bỏ qua thư này.\n\n"
        "EduLit-AI — THPT Đan Phượng"
    )
    preheader = f"Xin chào {name}, vui lòng bấm để kích hoạt tài khoản học sinh EduLit-AI của em."
    content = f"""\
<h2 style="margin: 0 0 16px; color: #0f172a; font-size: 18px; font-weight: 700;">Xác minh địa chỉ email</h2>
<p style="margin: 0 0 16px;">Xin chào <strong>{_escape(name)}</strong>,</p>
<p style="margin: 0 0 20px;">Chúc mừng em đã đăng ký tài khoản học sinh trên nền tảng <strong>EduLit-AI</strong> (Trường THPT Đan Phượng). Để hoàn tất đăng ký và bắt đầu học tập, vui lòng bấm nút xác nhận bên dưới:</p>

<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px auto;">
  <tr>
    <td align="center" style="border-radius: 8px; background-color: #006874;">
      <a href="{_escape(verify_url)}" target="_blank" style="font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; display: inline-block; font-weight: 700; letter-spacing: 0.3px;">
        Xác nhận tài khoản
      </a>
    </td>
  </tr>
</table>

<div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px 16px; margin: 24px 0 16px; font-size: 13px; color: #166534; line-height: 1.5;">
  <strong>💡 Lưu ý:</strong> Liên kết xác minh chỉ có hiệu lực một lần và sẽ hết hạn sau 24 giờ. Nếu em không thực hiện đăng ký này, hãy bỏ qua thư.
</div>

<p style="margin: 24px 0 0; font-size: 12px; color: #64748b; line-height: 1.5; word-break: break-all;">
  Nếu không bấm được nút ở trên, em hãy sao chép và dán trực tiếp liên kết sau vào thanh địa chỉ của trình duyệt:<br>
  <a href="{_escape(verify_url)}" style="color: #006874; text-decoration: underline;">{_escape(verify_url)}</a>
</p>
"""
    html = _base_template(subject, preheader, content)
    return EmailMessage(subject=subject, text_body=text, html_body=html)


def password_reset_email(display_name: str, reset_url: str) -> EmailMessage:
    name = display_name.strip() or "bạn"
    subject = "Đặt lại mật khẩu EduLit-AI"
    text = (
        f"Xin chào {name},\n\n"
        "Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn. "
        "Mở liên kết sau để chọn mật khẩu mới. Liên kết chỉ dùng một lần và sẽ hết hạn.\n\n"
        f"{reset_url}\n\n"
        "Nếu bạn không yêu cầu, hãy bỏ qua thư này. Tài khoản vẫn an toàn.\n\n"
        "EduLit-AI — THPT Đan Phượng"
    )
    preheader = f"Yêu cầu đặt lại mật khẩu tài khoản EduLit-AI cho {name}."
    content = f"""\
<h2 style="margin: 0 0 16px; color: #0f172a; font-size: 18px; font-weight: 700;">Yêu cầu đặt lại mật khẩu</h2>
<p style="margin: 0 0 16px;">Xin chào <strong>{_escape(name)}</strong>,</p>
<p style="margin: 0 0 20px;">Hệ thống nhận được yêu cầu đặt lại mật khẩu cho tài khoản EduLit-AI của bạn. Hãy bấm vào nút bên dưới để tiến hành tạo mật khẩu mới:</p>

<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="margin: 28px auto;">
  <tr>
    <td align="center" style="border-radius: 8px; background-color: #006874;">
      <a href="{_escape(reset_url)}" target="_blank" style="font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #ffffff; text-decoration: none; padding: 13px 32px; border-radius: 8px; display: inline-block; font-weight: 700; letter-spacing: 0.3px;">
        Đặt lại mật khẩu
      </a>
    </td>
  </tr>
</table>

<div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px 16px; margin: 24px 0 16px; font-size: 13px; color: #92400e; line-height: 1.5;">
  <strong>🔒 Bảo mật:</strong> Liên kết chỉ sử dụng được một lần. Nếu bạn không gửi yêu cầu này, xin hãy bỏ qua email. Tài khoản của bạn vẫn được an toàn tuyệt đối.
</div>

<p style="margin: 24px 0 0; font-size: 12px; color: #64748b; line-height: 1.5; word-break: break-all;">
  Nếu không bấm được nút ở trên, vui lòng sao chép liên kết này vào trình duyệt:<br>
  <a href="{_escape(reset_url)}" style="color: #006874; text-decoration: underline;">{_escape(reset_url)}</a>
</p>
"""
    html = _base_template(subject, preheader, content)
    return EmailMessage(subject=subject, text_body=text, html_body=html)


def password_changed_email(display_name: str) -> EmailMessage:
    name = display_name.strip() or "bạn"
    subject = "Mật khẩu EduLit-AI đã được thay đổi"
    text = (
        f"Xin chào {name},\n\n"
        "Mật khẩu tài khoản EduLit-AI vừa được thay đổi. "
        "Mọi phiên đăng nhập trên các thiết bị đã được đăng xuất an toàn.\n\n"
        "Nếu bạn không thực hiện thao tác này, hãy dùng chức năng quên mật khẩu ngay lập tức.\n\n"
        "EduLit-AI — THPT Đan Phượng"
    )
    preheader = f"Thông báo: Mật khẩu tài khoản EduLit-AI của {name} đã được cập nhật."
    content = f"""\
<h2 style="margin: 0 0 16px; color: #0f172a; font-size: 18px; font-weight: 700;">Mật khẩu đã được thay đổi</h2>
<p style="margin: 0 0 16px;">Xin chào <strong>{_escape(name)}</strong>,</p>
<p style="margin: 0 0 16px;">Mật khẩu tài khoản EduLit-AI của bạn vừa được thay đổi thành công. Để đảm bảo tính bảo mật, tất cả các phiên đăng nhập khác trên các thiết bị đã được tự động đăng xuất.</p>

<div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin: 24px 0; font-size: 13px; color: #991b1b; line-height: 1.5;">
  <strong>⚠️ Cảnh báo an ninh:</strong> Nếu bạn không thực hiện thay đổi này, hãy truy cập EduLit-AI và sử dụng chức năng <em>"Quên mật khẩu"</em> ngay lập tức để thiết lập lại quyền kiểm soát.
</div>
"""
    html = _base_template(subject, preheader, content)
    return EmailMessage(subject=subject, text_body=text, html_body=html)
