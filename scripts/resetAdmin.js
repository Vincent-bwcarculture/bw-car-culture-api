// resetAdmin.js - A script to reset admin users
// Run with: node scripts/resetAdmin.js

// Import required modules
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import readline from 'readline';

// ES Module fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// CONFIGURATION - SET WITH THE SPECIFIED ADMIN
const NEW_ADMIN = {
  email: "kvramphotho@gmail.com", // Replace with actual email
  name: "Katso Vincent Ramphotho",
  password: "R@mph0th0#Adm1n_2025!" // Strong password
};

console.log("Starting admin reset script...");

// Try to load environment variables from multiple possible locations
const possibleEnvPaths = [
  path.join(__dirname, '../.env'),           // Project root
  path.join(__dirname, '../../.env'),        // One level up from project root
  path.join(__dirname, '../server/.env'),    // Server directory
  path.join(__dirname, '../../server/.env'), // Server directory from one level up
  path.join(process.cwd(), '.env')           // Current working directory
];

// Try to find and load a valid .env file
let envLoaded = false;
for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    console.log(`Loading environment variables from: ${envPath}`);
    dotenv.config({ path: envPath });
    envLoaded = true;
    break;
  }
}

if (!envLoaded) {
  console.warn("No .env file found in common locations. Will prompt for MongoDB URI.");
}

// Setup readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Check if we have a MongoDB URI or need to prompt
const promptForMongoURI = () => {
  return new Promise((resolve) => {
    if (process.env.MONGODB_URI) {
      console.log("Found MONGODB_URI in environment variables.");
      resolve(process.env.MONGODB_URI);
    } else {
      console.log("\n*** MongoDB Connection Required ***");
      console.log("Please enter your MongoDB connection string");
      console.log("Example: mongodb://localhost:27017/your-database");
      console.log("Example: mongodb+srv://username:password@cluster.mongodb.net/your-database");
      
      rl.question("MongoDB URI: ", (uri) => {
        if (uri && uri.trim()) {
          // Save for future use in the process
          process.env.MONGODB_URI = uri.trim();
          resolve(uri.trim());
        } else {
          console.error("Error: No MongoDB URI provided. Script cannot continue.");
          rl.close();
          process.exit(1);
        }
      });
    }
  });
};

// Define User schema (simplified version of your actual model)
const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  status: String
}, { timestamps: true });

// Add password hashing hook
UserSchema.pre('save', async function(next) {
  if (!this.isModified('password')) {
    return next();
  }
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Run the admin reset process
const resetAdmin = async () => {
  try {
    // Get MongoDB URI either from env vars or user input
    const mongoURI = await promptForMongoURI();
    
    // Create User model
    const User = mongoose.model('User', UserSchema);
    
    // Connect to the database
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGODB_NAME
    });
    
    console.log("Connected to MongoDB successfully!");
    
    // Step 1: Find and downgrade existing admin users
    const existingAdmins = await User.find({ role: "admin" });
    console.log(`Found ${existingAdmins.length} existing admin users`);
    
    for (const admin of existingAdmins) {
      console.log(`Downgrading admin: ${admin.email}`);
      admin.role = "user";
      await admin.save();
    }
    
    // Step 2: Create or update new admin user
    let adminUser = await User.findOne({ email: NEW_ADMIN.email });
    
    if (adminUser) {
      console.log(`Updating existing user to admin: ${NEW_ADMIN.email}`);
      adminUser.role = "admin";
      adminUser.status = "active";
      adminUser.name = NEW_ADMIN.name; // Ensure name is updated
      
      // Update password
      adminUser.password = NEW_ADMIN.password;
      
      await adminUser.save();
    } else {
      console.log(`Creating new admin user: ${NEW_ADMIN.email}`);
      adminUser = new User({
        name: NEW_ADMIN.name,
        email: NEW_ADMIN.email,
        password: NEW_ADMIN.password,
        role: "admin",
        status: "active"
      });
      
      await adminUser.save();
    }
    
    // Final check
    const adminCount = await User.countDocuments({ role: "admin" });
    console.log(`Admin reset complete. Current admin count: ${adminCount}`);
    console.log(`You can now login with: ${NEW_ADMIN.email} and your specified password`);
    
    // Print password details for confirmation (but censor most of it)
    const pwLength = NEW_ADMIN.password.length;
    const censored = NEW_ADMIN.password.substring(0, 2) + '*'.repeat(pwLength - 4) + NEW_ADMIN.password.substring(pwLength - 2);
    console.log(`Password (censored): ${censored} (${pwLength} characters)`);
    
  } catch (error) {
    console.error("Error during admin reset:", error);
    console.error(error.stack);
  } finally {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.close();
      console.log("MongoDB connection closed");
    }
    rl.close();
  }
};

// Execute the reset function
resetAdmin();