const nodemailer = require('nodemailer');

function createTransporter() {
  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER || 'dreamcatcherimmigration25@gmail.com',
      pass: process.env.EMAIL_PASS || 'csiz fkyl mnxu tfap'
    }
  });
}

exports.sendMail = async (mailOptions, defaultFromName = 'VFS Global') => {
  const fromAddress = process.env.EMAIL_USER || 'dreamcatcherimmigration25@gmail.com';
  const transporter = createTransporter();

  return transporter.sendMail({
    from: mailOptions.from || `"${defaultFromName}" <${fromAddress}>`,
    ...mailOptions
  });
};
