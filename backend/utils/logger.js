/**
 * Debug Logging Utility
 *
 * Provides toggleable debug logging for:
 * - HTTP API calls (curl format)
 * - CLI command executions
 *
 * Environment variables:
 * - LOG_API_CALLS: Enable HTTP API request/response logging
 * - LOG_CLI_CALLS: Enable CLI command execution logging
 */

// Helper functions to check env vars lazily (after .env is loaded)
function isApiLoggingEnabled() {
  return process.env.LOG_API_CALLS === 'true' || process.env.LOG_API_CALLS === '1';
}

function isCliLoggingEnabled() {
  return process.env.LOG_CLI_CALLS === 'true' || process.env.LOG_CLI_CALLS === '1';
}

/**
 * Log HTTP API request in curl format
 * @param {string} method - HTTP method
 * @param {string} url - Full URL
 * @param {Object} headers - Request headers
 * @param {Object|string|FormData} body - Request body
 */
export function logApiRequest(method, url, headers = {}, body = null) {
  if (!isApiLoggingEnabled()) return;

  console.log('\n========== API REQUEST ==========');
  console.log(`[API] ${method} ${url}`);

  // Build curl command
  let curlCmd = `curl -X ${method} '${url}'`;

  // Add headers to curl
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== 'content-type') {
      curlCmd += ` \\\n  -H '${key}: ${value}'`;
    }
  }

  // Add body to curl
  if (body) {
    if (body instanceof FormData) {
      curlCmd += ` \\\n  -H 'Content-Type: multipart/form-data' \\\n  --data-raw '<FORM_DATA>'`;
      console.log('[API] Content-Type: multipart/form-data');
      console.log('[API] FormData fields:');
      // FormData is not iterable in all environments, try to log what we can
      try {
        for (const [key, value] of body.entries()) {
          if (value instanceof Blob) {
            console.log(`  ${key}: <Blob size=${value.size} type=${value.type}>`);
          } else {
            console.log(`  ${key}: ${value}`);
          }
        }
      } catch (e) {
        console.log('  <Unable to enumerate FormData entries>');
      }
    } else if (typeof body === 'string') {
      curlCmd += ` \\\n  -H 'Content-Type: ${headers['Content-Type'] || 'application/json'}'`;
      curlCmd += ` \\\n  -d '${body}'`;
      console.log(`[API] Content-Type: ${headers['Content-Type'] || 'application/json'}`);
      console.log('[API] Request body:', body);
    } else if (typeof body === 'object') {
      // Check if object is empty (like GET requests)
      const isEmpty = body && Object.keys(body).length === 0;
      if (isEmpty) {
        // No body to log
        console.log('[API] Request body: <empty>');
      } else {
        const bodyStr = JSON.stringify(body, null, 2);
        curlCmd += ` \\\n  -H 'Content-Type: ${headers['Content-Type'] || 'application/json'}'`;
        curlCmd += ` \\\n  -d '${bodyStr.replace(/'/g, "'\"'\"'")}'`;
        console.log(`[API] Content-Type: ${headers['Content-Type'] || 'application/json'}`);
        console.log('[API] Request body:', bodyStr);
      }
    }
  }

  console.log('[API] Curl command:');
  console.log(curlCmd);
  console.log('====================================\n');
}

/**
 * Log HTTP API response
 * @param {Response} response - Fetch response object
 * @param {Object|string} data - Parsed response data (not logged to avoid large base64 payloads)
 */
export async function logApiResponse(response, data = null) {
  if (!isApiLoggingEnabled()) return;

  console.log('\n========== API RESPONSE ==========');
  console.log(`[API] Status: ${response.status} ${response.statusText}`);

  // Log response headers
  console.log('[API] Response headers:');
  response.headers.forEach((value, key) => {
    console.log(`  ${key}: ${value}`);
  });

  // Log response summary (not full body to avoid large base64 data)
  if (data) {
    if (data.data && Array.isArray(data.data)) {
      console.log(`[API] Response: ${data.data.length} image(s)`);
    } else if (data.id) {
      console.log(`[API] Response: job id=${data.id}, status=${data.status}`);
    } else if (data.created) {
      console.log(`[API] Response: created=${data.created}`);
    } else {
      console.log('[API] Response: <data received>');
    }
  }

  console.log('====================================\n');
}

/**
 * Log CLI command execution
 * @param {string} command - Command to execute
 * @param {string[]} args - Command arguments
 * @param {Object} options - Spawn options
 */
export function logCliCommand(command, args = [], options = {}) {
  if (!isCliLoggingEnabled()) return;

  console.log('\n========== CLI COMMAND ==========');
  console.log(`[CLI] Command: ${command}`);
  console.log(`[CLI] Args:`, args);
  console.log(`[CLI] Options:`, options);

  // Build shell command for easy copy-paste
  const escapedArgs = args.map(arg => {
    if (arg.includes(' ')) return `'${arg}'`;
    return arg;
  });
  const shellCmd = [command, ...escapedArgs].join(' ');

  console.log('[CLI] Shell command:');
  console.log(`  ${shellCmd}`);
  console.log('====================================\n');
}

/**
 * Log CLI command output
 * @param {string} stdout - Standard output
 * @param {string} stderr - Standard error
 * @param {number} exitCode - Process exit code
 */
export function logCliOutput(stdout, stderr, exitCode) {
  if (!isCliLoggingEnabled()) return;

  console.log('\n========== CLI OUTPUT ==========');
  console.log(`[CLI] Exit code: ${exitCode}`);

  if (stdout) {
    console.log('[CLI] Stdout:');
    console.log(stdout);
  }

  if (stderr) {
    console.log('[CLI] Stderr:');
    console.log(stderr);
  }

  console.log('===================================\n');
}

/**
 * Log CLI command error
 * @param {Error} error - Error object
 */
export function logCliError(error) {
  if (!isCliLoggingEnabled()) return;

  console.log('\n========== CLI ERROR ==========');
  console.log(`[CLI] Error: ${error.message}`);
  if (error.stack) {
    console.log('[CLI] Stack:', error.stack);
  }
  console.log('==================================\n');
}

/**
 * Wrapper for fetch that logs request and response
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>} Fetch response
 */
export async function loggedFetch(url, options = {}) {
  const method = options.method || 'GET';
  const headers = options.headers || {};
  const body = options.body;

  logApiRequest(method, url, headers, body);

  const response = await fetch(url, options);

  // Try to parse response for logging
  try {
    const clonedResponse = response.clone();
    const data = await clonedResponse.json();
    await logApiResponse(response, data);
  } catch {
    // Not JSON, log as text
    try {
      const clonedResponse = response.clone();
      const text = await clonedResponse.text();
      await logApiResponse(response, text.substring(0, 1000)); // Truncate large responses
    } catch {
      await logApiResponse(response, null);
    }
  }

  return response;
}
