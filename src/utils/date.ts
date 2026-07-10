/**
 * LOGIC: Provides date formatting utilities for the user interface, supporting standard locale-based formatting and relative time (e.g. "Just now", "3h ago").
 * EXPORTS:
 *   - formatDate (function)
 *   - formatRelativeTime (function)
 * FUNCTIONS:
 *   - formatDate(date, options): Converts timestamp/string/Date object into a readable date string using locale options.
 *   - formatRelativeTime(timestamp): Calculates delta against current time and returns relative intervals up to 7 days, falling back to absolute date.
 */

/**
 * Format a timestamp or date object into a consistent string format.
 * Default format: "MMM d, yyyy, h:mm a" (e.g. "Feb 19, 2026, 1:45 PM")
 *
 * @param date - Timestamp (number) or Date object
 * @param options - Optional Intl.DateTimeFormatOptions to override defaults
 * @returns Formatted date string
 */
export const formatDate = (
  date: number | string | Date,
  options?: Intl.DateTimeFormatOptions,
): string => {
  let d: Date;

  if (typeof date === "number") {
    d = new Date(date);
  } else if (typeof date === "string") {
    const parsed = Date.parse(date);
    if (!isNaN(parsed)) {
      d = new Date(parsed);
    } else {
      const num = Number(date);
      d = !isNaN(num) ? new Date(num) : new Date(date);
    }
  } else {
    d = date;
  }

  if (isNaN(d.getTime())) {
    return "Invalid Date";
  }

  if (options && (options.dateStyle || options.timeStyle)) {
    return d.toLocaleString("en-US", options);
  }

  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
    ...options,
  };

  return d.toLocaleString("en-US", defaultOptions);
};

/**
 * Format a date relative to now (e.g. "2 minutes ago", "Yesterday")
 * Useful for transaction history lists.
 */
export const formatRelativeTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;

  return formatDate(timestamp, { hour: undefined, minute: undefined });
};
