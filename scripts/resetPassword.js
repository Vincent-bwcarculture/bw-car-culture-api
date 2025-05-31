// server/scripts/resetPassword.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars
dotenv.config({ path: path.join(__dirname, '..', '.env') });

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  dbName: process.env.MONGODB_NAME
});

const db = mongoose.connection;

db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', () => {
  console.log('Database connected successfully');
});

// User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  status: String
});

const User = mongoose.model('User', UserSchema);

// Reset password function
async function resetPassword(email, newPassword) {
  try {
    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      console.error(`User not found with email: ${email}`);
      process.exit(1);
    }
    
    console.log(`User found: ${user.name}, ${user.email}, role: ${user.role}`);
    
    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);
    
    // Update user with new password
    user.password = hashedPassword;
    await user.save();
    
    console.log(`Password updated successfully for ${email}`);
    process.exit(0);
  } catch (error) {
    console.error('Error resetting password:', error);
    process.exit(1);
  }
}

// Get admin email and new password from command line arguments
const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('Usage: node resetPassword.js <email> <newPassword>');
  process.exit(1);
}

const [email, newPassword] = args;
resetPassword(email, newPassword);