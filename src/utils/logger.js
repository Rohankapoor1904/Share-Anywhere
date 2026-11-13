/**
 * Structured logger for LocalShare application.
 * Adheres to Anti-Fake Contract: never used as state substitute.
 */

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  SILENT: 4
};

let currentLevel = LOG_LEVELS.INFO;

export function setLogLevel(level) {
  if (typeof level === 'string' && LOG_LEVELS[level.toUpperCase()] !== undefined) {
    currentLevel = LOG_LEVELS[level.toUpperCase()];
  } else if (typeof level === 'number') {
    currentLevel = level;
  }
}

/**
 * @param {string} tag
 */
export function createLogger(tag) {
  const formatPrefix = (level) => {
    const timestamp = new Date().toISOString();
    return `[${timestamp}] [${level}] [${tag}]`;
  };

  return {
    debug(message, ...args) {
      if (currentLevel <= LOG_LEVELS.DEBUG) {
        // eslint-disable-next-line no-console
        console.info(formatPrefix('DEBUG'), message, ...args);
      }
    },
    info(message, ...args) {
      if (currentLevel <= LOG_LEVELS.INFO) {
        // eslint-disable-next-line no-console
        console.info(formatPrefix('INFO'), message, ...args);
      }
    },
    warn(message, ...args) {
      if (currentLevel <= LOG_LEVELS.WARN) {
        console.warn(formatPrefix('WARN'), message, ...args);
      }
    },
    error(message, error, ...args) {
      if (currentLevel <= LOG_LEVELS.ERROR) {
        console.error(formatPrefix('ERROR'), message, error, ...args);
      }
    }
  };
}

export const defaultLogger = createLogger('LocalShare');
