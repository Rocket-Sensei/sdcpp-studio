/**
 * Argument processing utilities for model commands
 */

/**
 * Process arguments, replacing placeholders
 * @param {Array} args - Arguments array
 * @param {Object} context - Context for replacements
 * @param {number} context.port - Port number to substitute
 * @param {Object} [context.model] - Model object with id property
 * @returns {Array} Processed arguments
 */
export function processArgs(args, context) {
  return args.map(arg => {
    // Replace port placeholder
    arg = arg.replace(/\{port\}/g, context.port);
    arg = arg.replace(/\$\{port\}/g, context.port);

    // Replace model-specific placeholders
    if (context.model) {
      arg = arg.replace(/\{model\.id\}/g, context.model.id);
      arg = arg.replace(/\$\{model\.id\}/g, context.model.id);
    }

    return arg;
  });
}

/**
 * Check if server output indicates it's ready
 * @param {string} output - Process output
 * @returns {boolean} True if server appears ready
 */
export function isServerReady(output) {
  const readyPatterns = [
    /listening/i,
    /server.*ready/i,
    /started.*on.*port/i,
    /serving.*http/i,
    /accepting.*connections/i,
    /ready.*accept/i,
    /Uvicorn running/i,
    /Application startup complete/i
  ];

  return readyPatterns.some(pattern => pattern.test(output));
}
