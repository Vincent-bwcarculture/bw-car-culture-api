// Create this file at: carculturewebsite/server/scripts/createAdmin.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env vars from root directory
dotenv.config({ path: path.join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
console.log('Connecting to MongoDB:', MONGODB_URI);

// Connect to MongoDB
mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('MongoDB Connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Create User Schema
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: {
    type: String,
    default: 'user'
  },
  status: {
    type: String,
    default: 'active'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

const User = mongoose.model('User', UserSchema);

// Create admin user
async function createAdminUser() {
  try {
    // Check if admin exists
    const existingAdmin = await User.findOne({ email: 'admin@i3wcarculture.com' });
    
    if (existingAdmin) {
      console.log('Admin user already exists:', existingAdmin.email);
      
      // Update admin password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('Admin123!', salt);
      
      existingAdmin.password = hashedPassword;
      existingAdmin.updatedAt = new Date();
      await existingAdmin.save();
      
      console.log('Admin password has been reset');
    } else {
      // Create salt & hash
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash('Admin123!', salt);

      // Create admin user
      const adminUser = new User({
        name: 'Admin User',
        email: 'admin@i3wcarculture.com',
        password: hashedPassword,
        role: 'admin',
        status: 'active'
      });

      await adminUser.save();
      console.log('Admin user created successfully:', adminUser);
    }

    process.exit(0);
  } catch (err) {
    console.error('Error creating admin user:', err);
    process.exit(1);
  }
}

createAdminUser();