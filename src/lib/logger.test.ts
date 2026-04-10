import { describe, it, expect, afterEach } from 'vitest';
import { logger, log } from './logger';
import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), '.log');

describe('Logger', () => {
  afterEach(() => {
    // Clean up log file after each test
    if (fs.existsSync(LOG_FILE)) {
      fs.unlinkSync(LOG_FILE);
    }
  });

  it('should write to log file on server side', () => {
    logger.info('TestModule', 'Test message', { key: 'value' });

    // Check if log file exists
    expect(fs.existsSync(LOG_FILE)).toBe(true);

    // Check log content
    const logContent = fs.readFileSync(LOG_FILE, 'utf8');
    expect(logContent).toContain('[INFO]');
    expect(logContent).toContain('[TestModule]');
    expect(logContent).toContain('Test message');
  });

  it('should log different levels correctly', () => {
    logger.info('Test', 'Info message');
    logger.warn('Test', 'Warning message');
    logger.error('Test', 'Error message');
    logger.debug('Test', 'Debug message');

    const logContent = fs.readFileSync(LOG_FILE, 'utf8');
    expect(logContent).toContain('[INFO]');
    expect(logContent).toContain('[WARN]');
    expect(logContent).toContain('[ERROR]');
    expect(logContent).toContain('[DEBUG]');
  });

  it('should include timestamp in logs', () => {
    logger.info('Test', 'Timestamp test');

    const logContent = fs.readFileSync(LOG_FILE, 'utf8');
    // Should match ISO timestamp format like [2024-01-15T10:30:00.000Z]
    expect(logContent).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\]/);
  });

  it('should serialize data objects as JSON', () => {
    const testData = { userId: 123, action: 'test', timestamp: '2024-01-01' };
    logger.info('Test', 'Data serialization test', testData);

    const logContent = fs.readFileSync(LOG_FILE, 'utf8');
    expect(logContent).toContain('"userId":123');
    expect(logContent).toContain('"action":"test"');
  });

  it('should handle log function directly', () => {
    log('info', 'DirectLog', 'Direct log call', { test: true });

    const logContent = fs.readFileSync(LOG_FILE, 'utf8');
    expect(logContent).toContain('[INFO]');
    expect(logContent).toContain('[DirectLog]');
    expect(logContent).toContain('Direct log call');
  });
});
