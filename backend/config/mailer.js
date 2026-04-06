const nodemailer = require('nodemailer');

const transporter = process.env.MAIL_HOST ? nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT) || 587,
  secure: false,
  auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASSWORD },
  tls: { rejectUnauthorized: false },
}) : null;

const AUTH_SERVER_URL = process.env.AUTH_SERVER_URL || 'http://localhost:8090';

// receive_asset_email='T'인 사용자 이메일 목록 조회
async function getAssetEmailRecipients(token) {
  try {
    const res = await fetch(`${AUTH_SERVER_URL}/api/users`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const users = await res.json();
    if (!Array.isArray(users)) return [];
    return users.filter(u => u.receive_asset_email === 'T' && u.is_active).map(u => u.email);
  } catch { return []; }
}

function htmlTemplate(title, subtitle, rows) {
  const rowsHtml = rows.map(([label, value]) => `
    <tr>
      <td width="90" style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:12px;color:#94a3b8;font-weight:bold;vertical-align:top;font-family:'Malgun Gothic',sans-serif;">${label}</td>
      <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;font-size:14px;color:#1e293b;font-family:'Malgun Gothic',sans-serif;">${value}</td>
    </tr>`).join('');

  return `
    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="font-family:'Malgun Gothic',sans-serif;">
      <tr><td align="center"><table cellpadding="0" cellspacing="0" border="0" width="640" style="border:1px solid #e2e8f0;">
        <tr><td bgcolor="#0f172a" style="padding:28px 32px;">
          <div style="font-size:18px;font-weight:bold;color:#fff;">INNODIGM 자산관리</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:4px;">${subtitle}</div>
        </td></tr>
        <tr><td bgcolor="#fff" style="padding:32px;">
          <h2 style="font-size:16px;color:#1e293b;margin:0 0 20px;">${title}</h2>
          <table cellpadding="0" cellspacing="0" border="0" width="100%">${rowsHtml}</table>
        </td></tr>
        <tr><td bgcolor="#fff" style="padding:16px 32px;border-top:1px solid #e2e8f0;text-align:center;">
          <p style="color:#94a3b8;font-size:11px;margin:0;">본 메일은 자산관리 시스템에서 자동 발송됩니다. | https://asset.indg.co.kr</p>
        </td></tr>
      </table></td></tr>
    </table>`;
}

// 대여 요청 시 → 관리자에게 이메일
async function sendRequestNotification({ requesterName, assetName, assetCode, expectedReturn, requestNote, token }) {
  if (!transporter) return;
  const recipients = await getAssetEmailRecipients(token);
  if (recipients.length === 0) return;

  const mailOptions = {
    from: `"INDG 자산관리" <${process.env.MAIL_FROM}>`,
    to: recipients.join(', '),
    subject: `[자산 대여 요청] ${assetName} — ${requesterName}`,
    html: htmlTemplate('자산 대여 요청이 접수되었습니다', '새로운 대여 요청', [
      ['요청자', requesterName],
      ['자산명', assetName],
      ['자산코드', assetCode],
      ['반납예정일', expectedReturn],
      ['요청메모', requestNote || '-'],
    ]),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Mail] 대여 요청 알림 → ${recipients.join(', ')}`);
  } catch (err) {
    console.error('[Mail] 발송 실패:', err.message);
  }
}

// 승인/거절 시 → 요청자에게 이메일
async function sendApprovalNotification({ requesterEmail, requesterName, assetName, assetCode, status, responseNote }) {
  if (!transporter) return;

  const statusText = status === 'approved' ? '승인' : '거절';
  const mailOptions = {
    from: `"INDG 자산관리" <${process.env.MAIL_FROM}>`,
    to: requesterEmail,
    subject: `[자산 대여 ${statusText}] ${assetName}`,
    html: htmlTemplate(`자산 대여 요청이 ${statusText}되었습니다`, `대여 ${statusText} 안내`, [
      ['자산명', assetName],
      ['자산코드', assetCode],
      ['처리결과', `<strong style="color:${status === 'approved' ? '#059669' : '#dc2626'}">${statusText}</strong>`],
      ['응답메모', responseNote || '-'],
    ]),
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[Mail] 대여 ${statusText} 알림 → ${requesterEmail}`);
  } catch (err) {
    console.error('[Mail] 발송 실패:', err.message);
  }
}

module.exports = { sendRequestNotification, sendApprovalNotification };
