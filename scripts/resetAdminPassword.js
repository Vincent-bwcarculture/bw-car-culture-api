// server/scripts/resetAdminPassword.js
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const resetAdminPassword = async () => {
  try {
    console.log('MongoDB URI:', process.env.MONGODB_URI);
    
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: 'i3wcarculture'
    });

    console.log('Connected to MongoDB...');

    // Generate new password hash
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('E63SBrabusedition', salt);

    // Update admin user with complete user object
    const result = await mongoose.connection.collection('users').updateOne(
      { email: 'kvramphotho@i3wcarculture.com' },
      { 
        $set: { 
          name: 'Vincent Katso',
          email: 'kvramphotho@i3wcarculture.com',
          password: hashedPassword,
          role: 'admin',
          isAdmin: true,
          updatedAt: new Date(),
          createdAt: new Date()
        }
      },
      { upsert: true }
    );

    console.log('Password reset result:', result);
    
    // Verify the update with proper user retrieval
    const user = await mongoose.connection.collection('users').findOne(
      { email: 'kvramphotho@i3wcarculture.com' }
    );
    
    if (user) {
      console.log('Updated user details:', {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        isAdmin: user.isAdmin,
        hasPassword: !!user.password,
        passwordLength: user.password?.length,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt
      });
    } else {
      console.log('User not found after update!');
    }

    await mongoose.connection.close();
    console.log('Database connection closed');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

resetAdminPassword();