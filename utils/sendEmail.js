// server/utils/sendEmail.js
import nodemailer from 'nodemailer';

/**
 * Send email utility function
 * @param {Object} options - Email options
 * @param {string} options.email - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.message - Email message (HTML)
 * @returns {Promise} - Promise that resolves when email is sent
 */
export const sendEmail = async (options) => {
  try {
    // Create transporter object
    let transporter;

    if (process.env.NODE_ENV === 'production') {
      // Production email configuration
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_EMAIL,
          pass: process.env.SMTP_PASSWORD
        }
      });
    } else {
      // Development - use console logging instead of sending emails
      console.log('Email would be sent in production:');
      console.log('To:', options.email);
      console.log('Subject:', options.subject);
      console.log('Message:', options.message);
      return Promise.resolve();
    }

    // Email configuration
    const mailOptions = {
      from: `${process.env.FROM_NAME} <${process.env.FROM_EMAIL}>`,
      to: options.email,
      subject: options.subject,
      html: options.message
    };

    // Send email
    const info = await transporter.sendMail(mailOptions);

    console.log('Email sent successfully:', info.messageId);
    return info;
  } catch (error) {
    console.error('Email send error:', error);
    throw new Error('Email could not be sent');
  }
};

/**
 * Send password reset email
 * @param {string} email - User email
 * @param {string} resetUrl - Password reset URL
 * @returns {Promise}
 */
export const sendPasswordResetEmail = async (email, resetUrl) => {
  const message = `
    <h1>Password Reset Request</h1>
    <p>You requested a password reset. Please click the link below to reset your password:</p>
    <a href="${resetUrl}" target="_blank">Reset Password</a>
    <p>This link will expire in 10 minutes.</p>
    <p>If you did not request this, please ignore this email.</p>
  `;

  await sendEmail({
    email,
    subject: 'Password Reset - I3W Car Culture',
    message
  });
};

/**
 * Send welcome email
 * @param {string} email - User email
 * @param {string} name - User name
 * @returns {Promise}
 */
export const sendWelcomeEmail = async (email, name) => {
  const message = `
    <h1>Welcome to I3W Car Culture, ${name}!</h1>
    <p>Thank you for joining our community. We're excited to have you on board.</p>
    <p>Start exploring our marketplace and connect with car enthusiasts like yourself.</p>
    <p>If you have any questions, feel free to contact us.</p>
    <br>
    <p>Best regards,<br>The I3W Car Culture Team</p>
  `;

  await sendEmail({
    email,
    subject: 'Welcome to I3W Car Culture',
    message
  });
};

/**
 * Send admin approval email
 * @param {string} email - Admin email
 * @param {string} userEmail - New user email requiring approval
 * @returns {Promise}
 */
export const sendAdminApprovalEmail = async (email, userEmail) => {
  const message = `
    <h1>New Admin Registration</h1>
    <p>A new admin registration requires your approval:</p>
    <p><strong>Email:</strong> ${userEmail}</p>
    <p>Please log in to the admin panel to approve or reject this request.</p>
  `;

  await sendEmail({
    email,
    subject: 'Admin Approval Required - I3W Car Culture',
    message
  });
};

// Export all functions as default as well for flexibility
export default {
  sendEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendAdminApprovalEmail
};