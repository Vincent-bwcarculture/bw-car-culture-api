// server/utils/analyticsMonitoring.js
import { analyticsConfig } from '../config/analytics.js';
import analyticsService from '../services/analyticsService.js';
import { 
  PageView, 
  Session, 
  Interaction, 
  BusinessMetric, 
  SearchAnalytics, 
  PerformanceMetric 
} from '../models/Analytics.js';

class AnalyticsMonitoring {
  constructor() {
    this.alerts = [];
    this.metrics = {
      lastHealthCheck: null,
      errorCount: 0,
      warningCount: 0,
      systemHealth: 'unknown'
    };
    
    // Initialize monitoring
    this.initializeMonitoring();
  }

  // Initialize monitoring system
  initializeMonitoring() {
    if (!analyticsConfig.monitoring.enableHealthChecks) {
      console.log('Analytics monitoring disabled');
      return;
    }

    // Run health checks every 5 minutes
    setInterval(() => {
      this.performHealthCheck();
    }, 5 * 60 * 1000);

    // Run data quality checks every hour
    setInterval(() => {
      this.performDataQualityCheck();
    }, 60 * 60 * 1000);

    // Run performance analysis every 30 minutes
    setInterval(() => {
      this.analyzePerformance();
    }, 30 * 60 * 1000);

    // Initial health check
    setTimeout(() => {
      this.performHealthCheck();
    }, 10000); // 10 seconds after startup
  }

  // Comprehensive health check
  async performHealthCheck() {
    try {
      console.log('Performing analytics health check...');
      const startTime = Date.now();
      
      const checks = await Promise.allSettled([
        this.checkDatabaseConnectivity(),
        this.checkDataIngestion(),
        this.checkProcessingQueue(),
        this.checkDiskSpace(),
        this.checkMemoryUsage(),
        this.checkErrorRates()
      ]);

      const results = checks.map((check, index) => ({
        name: ['database', 'ingestion', 'queue', 'disk', 'memory', 'errors'][index],
        status: check.status === 'fulfilled' ? check.value.status : 'failed',
        details: check.status === 'fulfilled' ? check.value : { error: check.reason.message }
      }));

      const healthStatus = this.calculateHealthStatus(results);
      const responseTime = Date.now() - startTime;

      this.metrics = {
        lastHealthCheck: new Date(),
        responseTime,
        systemHealth: healthStatus.overall,
        checks: results,
        ...healthStatus
      };

      // Send alerts if needed
      if (healthStatus.overall === 'critical') {
        await this.sendAlert('critical', 'Analytics system critical health issues detected', results);
      } else if (healthStatus.overall === 'warning') {
        await this.sendAlert('warning', 'Analytics system health warnings detected', results);
      }

      console.log(`Analytics health check completed: ${healthStatus.overall} (${responseTime}ms)`);
      
    } catch (error) {
      console.error('Health check failed:', error);
      this.metrics.errorCount++;
      await this.sendAlert('error', 'Analytics health check failed', { error: error.message });
    }
  }

  // Check database connectivity and basic operations
  async checkDatabaseConnectivity() {
    try {
      const startTime = Date.now();
      
      // Test basic read operations
      const [pageViewCount, sessionCount, interactionCount] = await Promise.all([
        PageView.countDocuments({ timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        Session.countDocuments({ startTime: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
        Interaction.countDocuments({ timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } })
      ]);

      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTime,
        details: {
          pageViews24h: pageViewCount,
          sessions24h: sessionCount,
          interactions24h: interactionCount
        }
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Check data ingestion rates
  async checkDataIngestion() {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
      
      const recentData = await Promise.all([
        PageView.countDocuments({ timestamp: { $gte: oneHourAgo } }),
        Interaction.countDocuments({ timestamp: { $gte: oneHourAgo } }),
        SearchAnalytics.countDocuments({ timestamp: { $gte: oneHourAgo } })
      ]);

      const [pageViews, interactions, searches] = recentData;
      const totalEvents = pageViews + interactions + searches;
      
      // Expected minimum events per hour (configurable)
      const minExpectedEvents = parseInt(process.env.ANALYTICS_MIN_EVENTS_PER_HOUR) || 10;
      
      const status = totalEvents >= minExpectedEvents ? 'healthy' : 
                    totalEvents >= (minExpectedEvents * 0.5) ? 'warning' : 'critical';
      
      return {
        status,
        details: {
          eventsLastHour: totalEvents,
          pageViews,
          interactions,
          searches,
          expectedMinimum: minExpectedEvents
        }
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Check processing queue health
  async checkProcessingQueue() {
    try {
      const queueSize = analyticsService.processingQueue ? analyticsService.processingQueue.length : 0;
      const maxQueueSize = analyticsConfig.performance.batchSize * 5; // 5x batch size threshold
      
      const status = queueSize < maxQueueSize ? 'healthy' :
                    queueSize < (maxQueueSize * 1.5) ? 'warning' : 'critical';
      
      return {
        status,
        details: {
          queueSize,
          maxQueueSize,
          isProcessing: analyticsService.isProcessing
        }
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Check disk space (if running on server)
  async checkDiskSpace() {
    try {
      // This is a simplified check - in production you might want to use a library like 'check-disk-space'
      const stats = process.memoryUsage();
      
      return {
        status: 'healthy',
        details: {
          heapUsed: Math.round(stats.heapUsed / 1024 / 1024) + 'MB',
          heapTotal: Math.round(stats.heapTotal / 1024 / 1024) + 'MB',
          external: Math.round(stats.external / 1024 / 1024) + 'MB'
        }
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Check memory usage
  async checkMemoryUsage() {
    try {
      const usage = process.memoryUsage();
      const totalMemory = usage.heapTotal;
      const usedMemory = usage.heapUsed;
      const memoryUsagePercent = (usedMemory / totalMemory) * 100;
      
      const status = memoryUsagePercent < 80 ? 'healthy' :
                    memoryUsagePercent < 90 ? 'warning' : 'critical';
      
      return {
        status,
        details: {
          memoryUsagePercent: Math.round(memoryUsagePercent),
          heapUsed: Math.round(usedMemory / 1024 / 1024) + 'MB',
          heapTotal: Math.round(totalMemory / 1024 / 1024) + 'MB'
        }
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Check error rates
  async checkErrorRates() {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      
      const [totalInteractions, errorInteractions] = await Promise.all([
        Interaction.countDocuments({ timestamp: { $gte: oneHourAgo } }),
        Interaction.countDocuments({ 
          timestamp: { $gte: oneHourAgo },
          eventType: 'error'
        })
      ]);

      const errorRate = totalInteractions > 0 ? (errorInteractions / totalInteractions) * 100 : 0;
      const threshold = analyticsConfig.monitoring.alertThresholds.errorRate * 100;
      
      const status = errorRate < threshold ? 'healthy' :
                    errorRate < (threshold * 1.5) ? 'warning' : 'critical';
      
      return {
        status,
        details: {
          errorRate: Math.round(errorRate * 100) / 100,
          threshold,
          totalInteractions,
          errorInteractions
        }
      };
    } catch (error) {
      return {
        status: 'failed',
        error: error.message
      };
    }
  }

  // Perform data quality checks
  async performDataQualityCheck() {
    try {
      console.log('Performing data quality check...');
      
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const endOfYesterday = new Date(yesterday);
      endOfYesterday.setHours(23, 59, 59, 999);
      
      // Check for data completeness
      const [pageViewCount, sessionCount, interactionCount] = await Promise.all([
        PageView.countDocuments({ timestamp: { $gte: yesterday, $lte: endOfYesterday } }),
        Session.countDocuments({ startTime: { $gte: yesterday, $lte: endOfYesterday } }),
        Interaction.countDocuments({ timestamp: { $gte: yesterday, $lte: endOfYesterday } })
      ]);

      // Check for data anomalies
      const anomalies = [];
      
      // Check if we have zero data (potential issue)
      if (pageViewCount === 0 && sessionCount === 0 && interactionCount === 0) {
        anomalies.push('No analytics data recorded for yesterday');
      }
      
      // Check session to page view ratio (should be reasonable)
      if (pageViewCount > 0 && sessionCount > 0) {
        const ratio = pageViewCount / sessionCount;
        if (ratio < 1 || ratio > 50) { // Each session should have 1-50 page views typically
          anomalies.push(`Unusual session to page view ratio: ${ratio.toFixed(2)}`);
        }
      }

      console.log(`Data quality check completed. Anomalies: ${anomalies.length}`);
      
      if (anomalies.length > 0) {
        await this.sendAlert('warning', 'Data quality issues detected', { 
          date: yesterday.toISOString().split('T')[0],
          anomalies,
          stats: { pageViewCount, sessionCount, interactionCount }
        });
      }
      
    } catch (error) {
      console.error('Data quality check failed:', error);
      await this.sendAlert('error', 'Data quality check failed', { error: error.message });
    }
  }

  // Analyze performance trends
  async analyzePerformance() {
    try {
      const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      // Get average performance metrics
      const performanceStats = await PerformanceMetric.aggregate([
        { $match: { timestamp: { $gte: last24Hours } } },
        { 
          $group: {
            _id: null,
            avgLoadTime: { $avg: '$metrics.loadTime' },
            avgFCP: { $avg: '$metrics.firstContentfulPaint' },
            avgLCP: { $avg: '$metrics.largestContentfulPaint' },
            count: { $sum: 1 }
          }
        }
      ]);

      if (performanceStats.length > 0) {
        const stats = performanceStats[0];
        const issues = [];
        
        // Check against thresholds
        if (stats.avgLoadTime > 3000) {
          issues.push(`High average load time: ${Math.round(stats.avgLoadTime)}ms`);
        }
        
        if (stats.avgLCP > 2500) {
          issues.push(`High LCP: ${Math.round(stats.avgLCP)}ms`);
        }
        
        if (issues.length > 0) {
          await this.sendAlert('warning', 'Performance issues detected', {
            avgLoadTime: Math.round(stats.avgLoadTime),
            avgFCP: Math.round(stats.avgFCP),
            avgLCP: Math.round(stats.avgLCP),
            sampleSize: stats.count,
            issues
          });
        }
      }
      
    } catch (error) {
      console.error('Performance analysis failed:', error);
    }
  }

  // Calculate overall health status
  calculateHealthStatus(checks) {
    const healthyCount = checks.filter(c => c.status === 'healthy').length;
    const warningCount = checks.filter(c => c.status === 'warning').length;
    const criticalCount = checks.filter(c => c.status === 'critical').length;
    const failedCount = checks.filter(c => c.status === 'failed').length;
    
    let overall;
    if (criticalCount > 0 || failedCount > 0) {
      overall = 'critical';
    } else if (warningCount > 0) {
      overall = 'warning';
    } else {
      overall = 'healthy';
    }
    
    return {
      overall,
      healthyCount,
      warningCount,
      criticalCount,
      failedCount,
      totalChecks: checks.length
    };
  }

  // Send alert (placeholder - implement with your preferred alerting system)
  async sendAlert(severity, message, details) {
    const alert = {
      id: Date.now().toString(),
      timestamp: new Date(),
      severity,
      message,
      details,
      acknowledged: false
    };
    
    this.alerts.unshift(alert);
    
    // Keep only last 100 alerts
    if (this.alerts.length > 100) {
      this.alerts = this.alerts.slice(0, 100);
    }
    
    // Update metrics
    if (severity === 'error' || severity === 'critical') {
      this.metrics.errorCount++;
    } else if (severity === 'warning') {
      this.metrics.warningCount++;
    }
    
    // Log to console (in production, you'd send to your alerting system)
    console.log(`[ANALYTICS ALERT] ${severity.toUpperCase()}: ${message}`, details);
    
    // In production, implement integrations with:
    // - Email notifications
    // - Slack/Discord webhooks  
    // - PagerDuty/OpsGenie
    // - SMS alerts for critical issues
    
    return alert;
  }

  // Get current health status
  getHealthStatus() {
    return {
      ...this.metrics,
      alerts: this.alerts.slice(0, 10), // Last 10 alerts
      uptime: process.uptime(),
      environment: process.env.NODE_ENV,
      analyticsConfig: {
        enabled: analyticsConfig.features,
        dataRetention: analyticsConfig.dataRetention,
        performance: analyticsConfig.performance
      }
    };
  }

  // Acknowledge alert
  acknowledgeAlert(alertId, acknowledgedBy) {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
      alert.acknowledgedBy = acknowledgedBy;
      alert.acknowledgedAt = new Date();
      return true;
    }
    return false;
  }

  // Get performance summary
  async getPerformanceSummary(days = 7) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - days);
      
      const [
        avgResponseTime,
        errorCount,
        processingStats,
        dataVolume
      ] = await Promise.all([
        // Calculate average response time from health checks
        Promise.resolve(this.metrics.responseTime || 0),
        
        // Count errors
        Interaction.countDocuments({
          timestamp: { $gte: startDate },
          eventType: 'error'
        }),
        
        // Processing statistics
        Promise.resolve({
          queueSize: analyticsService.processingQueue?.length || 0,
          isProcessing: analyticsService.isProcessing || false
        }),
        
        // Data volume
        Promise.all([
          PageView.countDocuments({ timestamp: { $gte: startDate } }),
          Interaction.countDocuments({ timestamp: { $gte: startDate } }),
          Session.countDocuments({ startTime: { $gte: startDate } })
        ])
      ]);

      return {
        period: `${days} days`,
        avgResponseTime,
        errorCount,
        processing: processingStats,
        dataVolume: {
          pageViews: dataVolume[0],
          interactions: dataVolume[1],
          sessions: dataVolume[2],
          total: dataVolume[0] + dataVolume[1] + dataVolume[2]
        },
        systemHealth: this.metrics.systemHealth,
        lastHealthCheck: this.metrics.lastHealthCheck
      };
    } catch (error) {
      console.error('Error getting performance summary:', error);
      throw error;
    }
  }
}

// Create singleton instance
const analyticsMonitoring = new AnalyticsMonitoring();

export default analyticsMonitoring;
export { AnalyticsMonitoring };
