import nodemailer from 'nodemailer';

export async function sendMail({ to, subject, text }) {
  if (process.env.SMTP_URL) {
    const transporter = nodemailer.createTransport(process.env.SMTP_URL);
    await transporter.sendMail({
      from: process.env.SMTP_FROM || 'no-reply@legal-consult.local',
      to,
      subject,
      text,
    });
  } else {
    // dev-режим без SMTP: лист виводимо в консоль сервера
    console.log(`[dev-mail] Кому: ${to}\nТема: ${subject}\n${text}`);
  }
}

export async function sendPasswordResetEmail(email, resetUrl) {
  await sendMail({
    to: email,
    subject: 'Відновлення паролю — Legal Consult',
    text: `Вітаємо! Ви запросили скидання паролю. Перейдіть за посиланням (діє 1 годину):\n${resetUrl}\n\nЯкщо ви не запитували скидання — просто проігноруйте цей лист.`,
  });
}
