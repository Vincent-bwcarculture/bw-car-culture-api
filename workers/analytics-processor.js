// server/workers/analytics-processor.js
import '../env.js';
import { db } from '../config/database.js';
import analyticsService from '../services/analyticsService.js';
import analyticsMonitoring from '../utils/analyticsMonitoring.js';
import { createAnalyticsIndexes } from '../models/Analytics.js';

class AnalyticsProcessor {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
  }

  async start() {
    try {
      console.log('Starting Analytics Processor...');
      
      // Connect to database
      await db.connect();
      
      // Create indexes
      await createAnalyticsIndexes();
      
      // Start processing
      this.isRunning = true;
      this.scheduleProcessing();
      
      // Start monitoring
      console.log('Analytics Processor started successfully');
      
      // Graceful shutdown
      process.on('SIGTERM', () => this.stop());
      process.on('SIGINT', () => this.stop());
      
    } catch (error) {
      console.error('Failed to start Analytics Processor:', error);
      process.exit(1);
    }
  }

  scheduleProcessing() {
    // Process metrics every hour
    this.intervalId = setInterval(async () => {
      if (this.isRunning) {
        await this.processMetrics();
      }
    }, 60 * 60 * 1000); // 1 hour

    // Process yesterday's metrics immediately
    setTimeout(() => {
      this.processMetrics();
    }, 5000);
  }

  async processMetrics() {
    try {
      console.log('Processing analytics metrics...');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      
      await analyticsService.generateDailyMetrics(yesterday);
      
      console.log('Analytics metrics processed successfully');
    } catch (error) {
      console.error('Error processing analytics metrics:', error);
    }
  }

  async stop() {
    console.log('Stopping Analytics Processor...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
    
    await db.handleAppTermination();
    process.exit(0);
  }
}

// Start the processor if this file is run directly
if (process.env.ANALYTICS_WORKER_MODE === 'true') {
  const processor = new AnalyticsProcessor();
  processor.start();
}

export default AnalyticsProcessor;
