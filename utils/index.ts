import type { Frequency } from './types.d';

// Convert cents to dollars by dividing by 100 and fix to 2 decimal places
export function formatCentsToCurrency(cents: number): string {
  const dollars = (cents / 100).toFixed(2);
  return dollars;
}

// Format date to display relative time (e.g., "1 hour ago", "in 5 days")
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInMilliseconds = date.getTime() - now.getTime();
  const diffInSeconds = Math.floor(diffInMilliseconds / 1000);
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  const diffInHours = Math.floor(diffInMinutes / 60);
  const diffInDays = Math.floor(diffInHours / 24);

  // Past
  if (diffInMilliseconds < 0) {
    if (diffInMinutes > -60) {
      return `${Math.abs(diffInMinutes)} ${Math.abs(diffInMinutes) === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffInHours > -24) {
      return `${Math.abs(diffInHours)} ${Math.abs(diffInHours) === 1 ? 'hour' : 'hours'} ago`;
    } else if (diffInDays > -7) {
      return `${Math.abs(diffInDays)} ${Math.abs(diffInDays) === 1 ? 'day' : 'days'} ago`;
    }
  }
  // Future
  else {
    if (diffInDays === 0) {
      return 'Today';
    } else if (diffInDays === 1) {
      return 'Tomorrow';
    } else if (diffInDays < 7) {
      return `in ${diffInDays} days`;
    } else if (diffInDays < 14) {
      return `in 1 week`;
    } else if (diffInDays < 30) {
      return `in ${Math.floor(diffInDays / 7)} weeks`;
    } else if (diffInDays < 60) {
      return `in 1 month`;
    } else {
      return `in ${Math.floor(diffInDays / 30)} months`;
    }
  }

  // Default format for dates far in past or future
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Format day of week and date (e.g., "Monday 21/04/2025")
export function formatDayAndDate(date: Date): string {
  const dayOfWeek = date.toLocaleDateString('en-US', { weekday: 'long' });
  const day = date.getDate().toString().padStart(2, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const year = date.getFullYear();

  return `${dayOfWeek} ${day}/${month}/${year}`;
}

export function getNextRecurrenceDay(
  startDate: Date,
  freq: Frequency,
  today: Date = new Date()
): string {
  // Clone to avoid mutating inputs
  const next = new Date(startDate);

  // bump until strictly after today
  const advance = () => {
    switch (freq) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'annually':
        next.setFullYear(next.getFullYear() + 1);
        break;
    }
  };

  // If the start date is already past, advance until it's > today
  while (next <= today) {
    advance();
  }

  // compute raw difference in milliseconds
  const diffMs = next.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  const unit = diffDays === 1 ? 'day' : 'days';

  return `${diffDays} ${unit}`;
}

export function getRemainingRecurrenceCount(
  startDate: Date,
  freq: Frequency,
  recurrenceCount: number,
  today: Date = new Date()
): number {
  // Clone to avoid mutating inputs
  const next = new Date(startDate);

  // bump until strictly after today
  const advance = () => {
    switch (freq) {
      case 'daily':
        next.setDate(next.getDate() + 1);
        break;
      case 'weekly':
        next.setDate(next.getDate() + 7);
        break;
      case 'monthly':
        next.setMonth(next.getMonth() + 1);
        break;
      case 'annually':
        next.setFullYear(next.getFullYear() + 1);
        break;
    }
  };

  var pastRecurrenceCount = 0;
  // If the start date is already past, advance until it's > today
  while (next <= today) {
    advance();
    pastRecurrenceCount++;
  }

  return recurrenceCount - pastRecurrenceCount;
}

// Generate a random Xbox-like gamertag
export function generateRandomGamertag(): string {
  const adjectives = [
    'Swift',
    'Brave',
    'Clever',
    'Bold',
    'Quick',
    'Sharp',
    'Bright',
    'Fierce',
    'Silent',
    'Steel',
    'Storm',
    'Fire',
    'Ice',
    'Shadow',
    'Lightning',
    'Thunder',
    'Golden',
    'Silver',
    'Diamond',
    'Ruby',
    'Emerald',
    'Cosmic',
    'Nova',
    'Stellar',
    'Phantom',
    'Mystic',
    'Ancient',
    'Wild',
    'Frozen',
    'Blazing',
    'Electric',
    'Toxic',
    'Cyber',
    'Neon',
    'Digital',
    'Quantum',
    'Plasma',
    'Crystal',
    'Titan',
    'Alpha',
    'Beta',
    'Gamma',
    'Delta',
    'Omega',
    'Prime',
    'Elite',
    'Master',
    'Supreme',
  ];

  const nouns = [
    'Wolf',
    'Eagle',
    'Lion',
    'Tiger',
    'Dragon',
    'Phoenix',
    'Hawk',
    'Raven',
    'Bear',
    'Shark',
    'Viper',
    'Panther',
    'Falcon',
    'Cobra',
    'Rhino',
    'Scorpion',
    'Spider',
    'Warrior',
    'Knight',
    'Hunter',
    'Scout',
    'Ranger',
    'Sniper',
    'Assassin',
    'Guardian',
    'Defender',
    'Champion',
    'Gladiator',
    'Samurai',
    'Ninja',
    'Pirate',
    'Viking',
    'Titan',
    'Giant',
    'Demon',
    'Angel',
    'Spirit',
    'Ghost',
    'Phantom',
    'Specter',
    'Wraith',
    'Beast',
    'Monster',
    'Creature',
    'Machine',
    'Robot',
    'Cyborg',
    'Android',
    'Storm',
    'Thunder',
    'Lightning',
    'Blaze',
    'Frost',
    'Ice',
    'Fire',
    'Wind',
    'Earth',
    'Stone',
    'Steel',
    'Iron',
    'Gold',
    'Silver',
    'Diamond',
    'Crystal',
    'Gem',
    'Star',
    'Moon',
    'Sun',
    'Nova',
    'Comet',
    'Meteor',
    'Asteroid',
    'Planet',
    'Galaxy',
    'Universe',
    'Cosmos',
    'Void',
    'Abyss',
    'Shadow',
    'Light',
    'Dark',
    'Bright',
    'Glow',
    'Spark',
    'Flame',
    'Ember',
  ];

  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];
  const randomNumber = Math.floor(Math.random() * 1000); // Random number between 0-999

  return `${randomAdjective}${randomNoun}${randomNumber}`;
}

/**
 * Determines whether to use light or dark color based on the current color scheme
 */
export function useColorSchemeColor<T>(light: T, dark: T, colorScheme?: 'light' | 'dark'): T {
  const scheme = colorScheme || 'light';
  return scheme === 'dark' ? dark : light;
}

/**
 * Formats an avatar URI to handle both file URIs, URLs, and base64 data
 * @param avatarUri - The avatar URI which could be a file path, URL, or base64 string
 * @param cacheKey - Optional cache key to append for cache busting (only for portal URLs)
 * @returns A properly formatted URI for use with React Native Image component
 */
export function formatAvatarUri(avatarUri: string | null, cacheKey?: number): string | null {
  if (!avatarUri) return null;

  // If it's already a data URI or file URI, return as-is
  if (avatarUri.startsWith('data:') || avatarUri.startsWith('file:')) {
    return avatarUri;
  }

  // If it's an HTTP/HTTPS URL
  if (avatarUri.startsWith('http://') || avatarUri.startsWith('https://')) {
    // Add cache-busting for portal profile URLs to ensure fresh images
    if (cacheKey && avatarUri.includes('profile.getportal.cc')) {
      const separator = avatarUri.includes('?') ? '&' : '?';
      return `${avatarUri}${separator}_t=${cacheKey}`;
    }
    return avatarUri;
  }

  // If it looks like base64 data (long string with base64 characters), format as data URI
  if (avatarUri.length > 100 && /^[A-Za-z0-9+/]*={0,2}$/.test(avatarUri)) {
    return `data:image/png;base64,${avatarUri}`;
  }

  // For anything else, return as-is (might be a relative URL or other format)
  return avatarUri;
}

// =============================================================================
// EVENT EMITTER FOR CROSS-CONTEXT COMMUNICATION
// =============================================================================

type EventCallback = (data?: any) => void;

class EventEmitter {
  private events: Map<string, EventCallback[]> = new Map();

  on(eventName: string, callback: EventCallback): void {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, []);
    }
    this.events.get(eventName)!.push(callback);
  }

  off(eventName: string, callback: EventCallback): void {
    const callbacks = this.events.get(eventName);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }

  emit(eventName: string, data?: any): void {
    const callbacks = this.events.get(eventName);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }

  removeAllListeners(eventName?: string): void {
    if (eventName) {
      this.events.delete(eventName);
    } else {
      this.events.clear();
    }
  }
}

// Global event emitter instance for cross-context communication
export const globalEvents = new EventEmitter();

// =============================================================================
// TYPE EXPORTS
// =============================================================================

// Export all common types from the centralized types file
export * from './types.d';
