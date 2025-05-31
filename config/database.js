// src/config/database.js
import mongoose from 'mongoose';
import { AppError } from '../utils/errorHandler.js';

class Database {
  constructor() {
    this.connection = null;
    this.retryAttempts = 0;
    this.maxRetries = 3;
    this.retryDelay = 5000; // 5 seconds
  }

  async connect() {
    try {
      // Validate MongoDB URI
      if (!process.env.MONGODB_URI) {
        throw new Error('MONGODB_URI is not defined in environment variables');
      }

      // / Log connection attempt (remove in production)
      console.log('Attempting to connect to MongoDB...');
      console.log('Database Name:', process.env.MONGODB_NAME);

      if (this.connection) {
        console.log('Using existing database connection');
        return this.connection;
      }

      // Connection options
      const options = {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4,
        dbName: process.env.MONGODB_NAME // Explicitly set database name
      };

      this.connection = await mongoose.connect(process.env.MONGODB_URI, options);

      mongoose.connection.on('connected', () => {
        console.log('MongoDB connection established successfully');
      });

      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
        this.handleConnectionError(err);
      });

      mongoose.connection.on('disconnected', () => {
        console.log('MongoDB disconnected');
        this.handleDisconnect();
      });

      // Handle application termination
      process.on('SIGINT', this.handleAppTermination.bind(this));
      process.on('SIGTERM', this.handleAppTermination.bind(this));

  // Log success and available collections
  console.log(`MongoDB Connected: ${this.connection.connection.host}`);
  const collections = await this.connection.connection.db.listCollections().toArray();
  console.log('Available collections:', collections.map(col => col.name));
      
      return this.connection;
    } catch (error) {
      return this.handleConnectionError(error);
    }
  }

  async handleConnectionError(error) {
    console.error('Database connection error:', error);

    if (this.retryAttempts < this.maxRetries) {
      this.retryAttempts++;
      console.log(
        `Retrying connection... Attempt ${this.retryAttempts} of ${this.maxRetries}`
      );

      await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      return this.connect();
    }

    throw new AppError(
      'Failed to connect to database after multiple attempts',
      500
    );
  }

  async handleDisconnect() {
    if (process.env.NODE_ENV === 'production') {
      this.retryAttempts = 0;
      await this.connect();
    }
  }

  async handleAppTermination() {
    try {
      await mongoose.connection.close();
      console.log('MongoDB connection closed through app termination');
      process.exit(0);
    } catch (err) {
      console.error('Error during database disconnection:', err);
      process.exit(1);
    }
  }

  // Health check method
  async healthCheck() {
    try {
      if (mongoose.connection.readyState !== 1) {
        throw new Error('Database not connected');
      }

      // Perform a simple operation to test the connection
      await mongoose.connection.db.admin().ping();
      return true;
    } catch (error) {
      console.error('Database health check failed:', error);
      return false;
    }
  }
}

export const db = new Database();