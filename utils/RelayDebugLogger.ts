/**
 * Real-time Relay Status Debug Logger
 *
 * This utility provides a live-updating console table to debug relay status changes,
 * particularly useful for tracking issues during app background/foreground transitions.
 */

import { AppState, AppStateStatus } from 'react-native';
import type { RelayInfo } from './types';

interface DebugRelayInfo extends RelayInfo {
  lastStatusChange: string;
  timeSinceChange: string;
  connectionAttempts: number;
  appStateWhenChanged: AppStateStatus;
}

interface LogEntry {
  timestamp: string;
  time: string;
  type: 'STATUS_CHANGE' | 'APP_STATE' | 'EVENT' | 'SYSTEM';
  message: string;
  details?: any;
  relayUrl?: string;
  appState: AppStateStatus;
}

class RelayDebugLogger {
  private debugData: Map<string, DebugRelayInfo> = new Map();
  private isEnabled: boolean = false;
  private updateInterval: NodeJS.Timeout | null = null;
  private currentAppState: AppStateStatus = AppState.currentState;
  private startTime: number = Date.now();
  private logEntries: LogEntry[] = [];

  constructor() {
    // Listen to app state changes
    AppState.addEventListener('change', this.handleAppStateChange);
  }

  private addLogEntry(type: LogEntry['type'], message: string, details?: any, relayUrl?: string) {
    if (!this.isEnabled) return;

    const now = new Date();
    const entry: LogEntry = {
      timestamp: now.toISOString(),
      time: now.toLocaleTimeString(),
      type,
      message,
      details,
      relayUrl,
      appState: this.currentAppState,
    };

    this.logEntries.push(entry);

    // Keep only last 500 entries to prevent memory issues
    if (this.logEntries.length > 500) {
      this.logEntries = this.logEntries.slice(-500);
    }
  }

  private handleAppStateChange = (nextAppState: AppStateStatus) => {
    const transition = `${this.currentAppState} → ${nextAppState}`;
    const logMessage = `APP STATE TRANSITION: ${transition}`;

    console.log(`🔄 ${logMessage} at ${new Date().toLocaleTimeString()}`);

    this.addLogEntry('APP_STATE', logMessage, {
      from: this.currentAppState,
      to: nextAppState,
      timestamp: new Date().toISOString(),
    });

    this.currentAppState = nextAppState;

    // Force immediate table update on state change
    if (this.isEnabled) {
      this.updateTable();
    }
  };

  /**
   * Enable debug logging with live table updates
   */
  enable() {
    if (this.isEnabled) return;

    this.isEnabled = true;
    this.startTime = Date.now(); // Reset start time
    this.logEntries = []; // Clear previous logs

    console.log('🐛 RELAY DEBUG LOGGER ENABLED');
    console.log('📱 Current App State:', this.currentAppState);
    console.log('⏰ Debug session started at:', new Date().toLocaleTimeString());

    this.addLogEntry('SYSTEM', 'Debug session started', {
      appState: this.currentAppState,
      sessionId: this.startTime,
    });

    // Update table every 2 seconds
    this.updateInterval = setInterval(() => {
      this.updateTable();
    }, 2000);

    // Initial table display
    this.updateTable();
  }

  /**
   * Disable debug logging
   */
  disable() {
    if (!this.isEnabled) return;

    this.addLogEntry('SYSTEM', 'Debug session ended', {
      sessionDuration: Date.now() - this.startTime,
      totalLogEntries: this.logEntries.length,
      finalRelayCount: this.debugData.size,
    });

    this.isEnabled = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    console.log('🐛 RELAY DEBUG LOGGER DISABLED');
  }

  /**
   * Update relay status (called from NostrServiceContext)
   */
  updateRelayStatus(relayStatuses: RelayInfo[]) {
    if (!this.isEnabled) return;

    const now = Date.now();
    const currentTime = new Date().toLocaleTimeString();

    relayStatuses.forEach(relay => {
      const existing = this.debugData.get(relay.url);
      const isStatusChanged = !existing || existing.status !== relay.status;

      if (isStatusChanged) {
        const logMessage = `RELAY STATUS CHANGE: ${relay.url} → ${relay.status}`;
        console.log(`🔄 ${logMessage} (App: ${this.currentAppState})`);

        this.addLogEntry(
          'STATUS_CHANGE',
          logMessage,
          {
            relayUrl: relay.url,
            newStatus: relay.status,
            oldStatus: existing?.status || 'unknown',
            connected: relay.connected,
            appState: this.currentAppState,
          },
          relay.url
        );
      }

      this.debugData.set(relay.url, {
        ...relay,
        lastStatusChange: isStatusChanged ? currentTime : existing?.lastStatusChange || currentTime,
        timeSinceChange: existing?.lastStatusChange || currentTime,
        connectionAttempts: isStatusChanged
          ? (existing?.connectionAttempts || 0) + 1
          : existing?.connectionAttempts || 1,
        appStateWhenChanged: isStatusChanged
          ? this.currentAppState
          : existing?.appStateWhenChanged || this.currentAppState,
      });
    });

    // Remove relays that are no longer in the list
    const currentUrls = new Set(relayStatuses.map(r => r.url));
    for (const [url] of this.debugData) {
      if (!currentUrls.has(url)) {
        const logMessage = `RELAY REMOVED: ${url}`;
        console.log(`❌ ${logMessage} (App: ${this.currentAppState})`);

        this.addLogEntry(
          'STATUS_CHANGE',
          logMessage,
          {
            relayUrl: url,
            action: 'removed',
            appState: this.currentAppState,
          },
          url
        );

        this.debugData.delete(url);
      }
    }
  }

  /**
   * Update the console table in place
   */
  private updateTable() {
    if (!this.isEnabled || this.debugData.size === 0) return;

    // Clear console and show updated table
    console.clear();

    // Header info
    const sessionDuration = Math.floor((Date.now() - this.startTime) / 1000);
    console.log('🐛 RELAY STATUS DEBUG TABLE (Live Updates Every 2s)');
    console.log(
      `📱 App State: ${this.currentAppState} | ⏰ Session: ${sessionDuration}s | 🔄 Last Update: ${new Date().toLocaleTimeString()}`
    );
    console.log('─'.repeat(80));

    // Convert to table format
    const tableData = Array.from(this.debugData.values()).map(relay => {
      const timeSinceChange = this.getTimeSinceChange(relay.lastStatusChange);
      const shortUrl = this.getShortUrl(relay.url);

      return {
        Relay: shortUrl,
        Status: this.getStatusEmoji(relay.status) + ' ' + relay.status,
        Connected: relay.connected ? '✅' : '❌',
        'Last Change': relay.lastStatusChange,
        'Time Since': timeSinceChange,
        Attempts: relay.connectionAttempts,
        'App State': relay.appStateWhenChanged,
      };
    });

    // Display table
    console.table(tableData);

    // Summary
    const connected = Array.from(this.debugData.values()).filter(r => r.connected).length;
    const total = this.debugData.size;
    console.log(
      `📊 Summary: ${connected}/${total} relays connected | App State: ${this.currentAppState}`
    );
    console.log('─'.repeat(80));
  }

  private getStatusEmoji(status: string): string {
    switch (status) {
      case 'Connected':
        return '🟢';
      case 'Connecting':
        return '🟡';
      case 'Pending':
        return '🟠';
      case 'Initialized':
        return '🔵';
      case 'Disconnected':
        return '🔴';
      case 'Terminated':
        return '⚫';
      case 'Banned':
        return '🚫';
      default:
        return '❓';
    }
  }

  private getShortUrl(url: string): string {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace('relay.', '').replace('www.', '').slice(0, 20);
    } catch {
      return url.slice(0, 20);
    }
  }

  private getTimeSinceChange(lastChange: string): string {
    const now = new Date();
    const changeTime = new Date();
    const [time] = lastChange.split(' ');
    const [hours, minutes, seconds] = time.split(':').map(Number);

    changeTime.setHours(hours, minutes, seconds || 0, 0);

    const diffMs = now.getTime() - changeTime.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);

    if (diffSeconds < 60) return `${diffSeconds}s`;
    if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)}m`;
    return `${Math.floor(diffSeconds / 3600)}h`;
  }

  /**
   * Log app state transition details
   */
  logAppStateTransition(from: AppStateStatus, to: AppStateStatus) {
    if (!this.isEnabled) return;

    console.log('🔄 APP STATE TRANSITION DETAILS:');
    console.log(`   From: ${from} → To: ${to}`);
    console.log(`   Time: ${new Date().toLocaleTimeString()}`);
    console.log(`   Active Relays: ${this.debugData.size}`);
    console.log(
      `   Connected: ${Array.from(this.debugData.values()).filter(r => r.connected).length}`
    );
  }

  /**
   * Log specific events for debugging
   */
  logEvent(event: string, details?: any) {
    if (!this.isEnabled) return;

    const timestamp = new Date().toLocaleTimeString();
    console.log(`🔍 DEBUG EVENT [${timestamp}]: ${event}`);
    if (details) {
      console.log('   Details:', details);
    }

    this.addLogEntry('EVENT', event, details);
  }

  /**
   * Export current debug data for analysis
   */
  exportDebugData() {
    const data = {
      timestamp: new Date().toISOString(),
      appState: this.currentAppState,
      sessionDuration: Date.now() - this.startTime,
      relays: Array.from(this.debugData.values()),
    };

    console.log('📋 RELAY DEBUG DATA EXPORT:');
    console.log(JSON.stringify(data, null, 2));

    return data;
  }

  /**
   * Generate readable log for clipboard export
   */
  generateReadableLog(): string {
    const sessionDuration = Math.floor((Date.now() - this.startTime) / 1000);
    const connected = Array.from(this.debugData.values()).filter(r => r.connected).length;
    const total = this.debugData.size;

    let log = '';
    log += '🐛 RELAY DEBUG SESSION LOG\n';
    log += '═'.repeat(50) + '\n';
    log += `📅 Session Started: ${new Date(this.startTime).toLocaleString()}\n`;
    log += `⏱️  Session Duration: ${Math.floor(sessionDuration / 60)}m ${sessionDuration % 60}s\n`;
    log += `📱 Current App State: ${this.currentAppState}\n`;
    log += `🔗 Total Relays: ${total} | Connected: ${connected}\n`;
    log += `📝 Total Log Entries: ${this.logEntries.length}\n`;
    log += '\n';

    // Current relay status summary
    if (this.debugData.size > 0) {
      log += '📊 CURRENT RELAY STATUS\n';
      log += '─'.repeat(50) + '\n';
      Array.from(this.debugData.values())
        .sort((a, b) => a.url.localeCompare(b.url))
        .forEach(relay => {
          const shortUrl = this.getShortUrl(relay.url);
          const status = this.getStatusEmoji(relay.status);
          const connected = relay.connected ? '✅' : '❌';
          log += `${status} ${shortUrl.padEnd(20)} | ${relay.status.padEnd(12)} | ${connected} | Attempts: ${relay.connectionAttempts}\n`;
        });
      log += '\n';
    }

    // Detailed event log
    log += '📜 DETAILED EVENT LOG\n';
    log += '─'.repeat(50) + '\n';

    if (this.logEntries.length === 0) {
      log += 'No events recorded.\n';
    } else {
      this.logEntries.forEach((entry, index) => {
        const icon = this.getLogEntryIcon(entry.type);
        log += `${icon} [${entry.time}] ${entry.type}: ${entry.message}\n`;

        if (entry.details) {
          const detailsStr = this.formatDetails(entry.details);
          if (detailsStr) {
            log += `   📋 ${detailsStr}\n`;
          }
        }

        if (entry.relayUrl) {
          log += `   🔗 Relay: ${entry.relayUrl}\n`;
        }

        log += `   📱 App State: ${entry.appState}\n`;

        // Add separator between entries (except last one)
        if (index < this.logEntries.length - 1) {
          log += '   ' + '·'.repeat(30) + '\n';
        }
      });
    }

    log += '\n';
    log += '═'.repeat(50) + '\n';
    log += `Generated: ${new Date().toLocaleString()}\n`;

    return log;
  }

  private getLogEntryIcon(type: LogEntry['type']): string {
    switch (type) {
      case 'STATUS_CHANGE':
        return '🔄';
      case 'APP_STATE':
        return '📱';
      case 'EVENT':
        return '🔍';
      case 'SYSTEM':
        return '⚙️';
      default:
        return '📝';
    }
  }

  private formatDetails(details: any): string {
    if (!details) return '';

    try {
      // Handle common detail patterns
      if (details.from && details.to) {
        return `${details.from} → ${details.to}`;
      }

      if (details.oldStatus && details.newStatus) {
        return `${details.oldStatus} → ${details.newStatus}`;
      }

      if (details.success !== undefined) {
        return `Success: ${details.success}${details.connectedRelays !== undefined ? `, Connected: ${details.connectedRelays}` : ''}`;
      }

      if (details.error) {
        return `Error: ${details.error}`;
      }

      // For other objects, format key-value pairs
      const pairs: string[] = [];
      Object.entries(details).forEach(([key, value]) => {
        if (key !== 'timestamp' && value !== undefined) {
          pairs.push(`${key}: ${value}`);
        }
      });

      return pairs.join(', ');
    } catch (error) {
      return JSON.stringify(details);
    }
  }
}

// Singleton instance
export const relayDebugLogger = new RelayDebugLogger();

// Convenience functions for easy access
export const enableRelayDebug = () => relayDebugLogger.enable();
export const disableRelayDebug = () => relayDebugLogger.disable();
export const logRelayEvent = (event: string, details?: any) =>
  relayDebugLogger.logEvent(event, details);
export const exportRelayDebugData = () => relayDebugLogger.exportDebugData();
export const generateReadableDebugLog = () => relayDebugLogger.generateReadableLog();

export default relayDebugLogger;
