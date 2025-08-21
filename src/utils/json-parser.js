/**
 * JSON Parser Utilities
 * 
 * Provides robust JSON parsing with fallback mechanisms for malformed JSON.
 * Handles common issues like single quotes, mixed quotes, and escape sequences.
 */

export class JSONParser {
  /**
   * Parse tool arguments with robust error handling and fallbacks
   * @param {string} jsonString - The JSON string to parse
   * @param {Object} context - Additional context for logging
   * @param {Function} logger - Logger instance
   * @returns {Object} Parsed object or safe fallback
   */
  static parseToolArguments(jsonString, context = {}, logger = null) {
    if (!jsonString || typeof jsonString !== 'string') {
      if (logger) {
        logger.warn('Invalid input for JSON parsing', {
          ...context,
          inputType: typeof jsonString,
          inputValue: jsonString
        });
      }
      return {};
    }

    // First attempt: Standard JSON.parse
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      // Second attempt: Fix common issues (single quotes, etc.)
      try {
        const fixedJson = this._fixCommonJsonIssues(jsonString);
        return JSON.parse(fixedJson);
      } catch (fixError) {
        // Log detailed error and return safe fallback
        if (logger) {
          logger.warn('Failed to parse tool arguments, using fallback', {
            ...context,
            originalError: error.message,
            fixAttemptError: fixError.message,
            jsonLength: jsonString.length,
            jsonPreview: jsonString.substring(0, 100) + (jsonString.length > 100 ? '...' : ''),
            fixedJsonPreview: this._fixCommonJsonIssues(jsonString).substring(0, 100) + (jsonString.length > 100 ? '...' : '')
          });
        }
        return {};
      }
    }
  }

  /**
   * Fix common JSON formatting issues
   * @param {string} jsonString - The malformed JSON string
   * @returns {string} Fixed JSON string
   */
  static _fixCommonJsonIssues(jsonString) {
    let fixed = jsonString;

    // Fix single quotes to double quotes
    fixed = fixed.replace(/'/g, '"');

    // Fix unescaped quotes within string values (basic attempt)
    // This is a simple heuristic and may not cover all cases
    fixed = fixed.replace(/([^\\])"/g, '$1\\"');
    
    // Re-fix the quotes at the start of strings
    fixed = fixed.replace(/:"\\"/g, ':"');
    fixed = fixed.replace(/\{\\"/g, '{"');
    fixed = fixed.replace(/,\\"/g, ',"');

    // Fix trailing commas
    fixed = fixed.replace(/,\s*([}\]])/g, '$1');

    // Fix missing quotes around property names
    fixed = fixed.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');

    return fixed;
  }

  /**
   * Validate JSON string without parsing
   * @param {string} jsonString - The JSON string to validate
   * @returns {boolean} True if valid JSON
   */
  static isValidJSON(jsonString) {
    try {
      JSON.parse(jsonString);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse JSON with detailed error information
   * @param {string} jsonString - The JSON string to parse
   * @param {Object} context - Additional context for error reporting
   * @returns {Object} Result object with success, data, and error information
   */
  static parseWithDetails(jsonString, context = {}) {
    const result = {
      success: false,
      data: null,
      error: null,
      fixed: false,
      context: context
    };

    try {
      result.data = JSON.parse(jsonString);
      result.success = true;
      return result;
    } catch (error) {
      result.error = {
        message: error.message,
        type: 'parse_error',
        position: this._extractErrorPosition(error.message)
      };

      // Attempt to fix and parse again
      try {
        const fixedJson = this._fixCommonJsonIssues(jsonString);
        result.data = JSON.parse(fixedJson);
        result.success = true;
        result.fixed = true;
        result.error.type = 'fixed_parse_error';
        return result;
      } catch (fixError) {
        result.error.fixAttemptMessage = fixError.message;
        result.data = {};
        return result;
      }
    }
  }

  /**
   * Extract error position from JSON parse error message
   * @param {string} errorMessage - The error message from JSON.parse
   * @returns {number|null} Position of error or null if not found
   */
  static _extractErrorPosition(errorMessage) {
    const match = errorMessage.match(/position (\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }
}