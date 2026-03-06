require('dotenv').config();
const nodemailer = require('nodemailer');

async function test() {
  const transporter = nodemailer.createTransport({
    host: 'smtp.centrum.sk',
    port: 587,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: false },
    logger: true,   // detailný výpis
    debug: true,
  });

  try {
    await transporter.verify();
    console.log('✅ Spojenie a autentifikácia OK!');

    const info = await transporter.sendMail({
      from: `"Test Chata" <${process.env.EMAIL_USER}>`,
      to: 'nejaky.tvoj.druhy.email@gmail.com',  // sem svoj iný email
      subject: 'Test SMTP Centrum 587',
      text: 'Funguje to!'
    });
    console.log('✅ Odoslané:', info.messageId);
  } catch (err) {
    console.error('❌ Detaily chyby:', err);
  }
}

test();