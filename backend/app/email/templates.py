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


def verification_email(display_name: str, verify_url: str) -> EmailMessage:
    name = display_name.strip() or "bạn"
    subject = "Xác minh email tài khoản EduLit-AI"
    text = (
        f"Xin chào {name},\n\n"
        "Em vừa đăng ký tài khoản học sinh trên EduLit-AI. "
        "Hãy mở liên kết sau để xác minh email. Liên kết chỉ dùng một lần và sẽ hết hạn.\n\n"
        f"{verify_url}\n\n"
        "Nếu em không đăng ký, hãy bỏ qua thư này.\n\n"
        "EduLit-AI — THPT Đan Phượng"
    )
    html = f"""\
<p>Xin chào {_escape(name)},</p>
<p>Em vừa đăng ký tài khoản học sinh trên EduLit-AI. Hãy bấm liên kết dưới đây để xác minh email. Liên kết chỉ dùng một lần và sẽ hết hạn.</p>
<p><a href="{_escape(verify_url)}">Xác minh email</a></p>
<p>Nếu em không đăng ký, hãy bỏ qua thư này.</p>
<p>EduLit-AI — THPT Đan Phượng</p>
"""
    return EmailMessage(subject=subject, text_body=text, html_body=html)


def password_reset_email(display_name: str, reset_url: str) -> EmailMessage:
    name = display_name.strip() or "bạn"
    subject = "Đặt lại mật khẩu EduLit-AI"
    text = (
        f"Xin chào {name},\n\n"
        "Chúng tôi nhận được yêu cầu đặt lại mật khẩu. "
        "Mở liên kết sau để chọn mật khẩu mới. Liên kết chỉ dùng một lần và sẽ hết hạn.\n\n"
        f"{reset_url}\n\n"
        "Nếu bạn không yêu cầu, hãy bỏ qua thư này. Tài khoản vẫn an toàn.\n\n"
        "EduLit-AI — THPT Đan Phượng"
    )
    html = f"""\
<p>Xin chào {_escape(name)},</p>
<p>Chúng tôi nhận được yêu cầu đặt lại mật khẩu. Bấm liên kết dưới đây để chọn mật khẩu mới. Liên kết chỉ dùng một lần và sẽ hết hạn.</p>
<p><a href="{_escape(reset_url)}">Đặt lại mật khẩu</a></p>
<p>Nếu bạn không yêu cầu, hãy bỏ qua thư này. Tài khoản vẫn an toàn.</p>
<p>EduLit-AI — THPT Đan Phượng</p>
"""
    return EmailMessage(subject=subject, text_body=text, html_body=html)


def password_changed_email(display_name: str) -> EmailMessage:
    name = display_name.strip() or "bạn"
    subject = "Mật khẩu EduLit-AI đã được thay đổi"
    text = (
        f"Xin chào {name},\n\n"
        "Mật khẩu tài khoản EduLit-AI vừa được thay đổi. "
        "Mọi phiên đăng nhập trên các thiết bị đã được đăng xuất.\n\n"
        "Nếu bạn không thực hiện thao tác này, hãy dùng chức năng quên mật khẩu ngay lập tức.\n\n"
        "EduLit-AI — THPT Đan Phượng"
    )
    html = f"""\
<p>Xin chào {_escape(name)},</p>
<p>Mật khẩu tài khoản EduLit-AI vừa được thay đổi. Mọi phiên đăng nhập trên các thiết bị đã được đăng xuất.</p>
<p>Nếu bạn không thực hiện thao tác này, hãy dùng chức năng quên mật khẩu ngay lập tức.</p>
<p>EduLit-AI — THPT Đan Phượng</p>
"""
    return EmailMessage(subject=subject, text_body=text, html_body=html)
