/**
 * Utility to filter out noisy / irrelevant HTTP requests from logs.
 *
 * @param {string} url - The request URL to check
 * @returns {boolean} - true if the request should be ignored (not logged)
 */
export function shouldIgnoreRequest(url) {
  // 1. Ignore static asset requests (.svg, .png, .ico, .js, .css, etc.)
  if (/\.(svg|png|ico|jpg|jpeg|css|js|map)$/i.test(url)) {
    return true;
  }
  // 2. Ignore Bull Board UI and API polling routes
  if (url.startsWith('/admin/queues') || url.startsWith('/api/queues')) {
    return true;
  }
  // 3. Ignore healthcheck routes (optional)
  if (url === '/health' || url === '/ping') {
    return true;
  }
  return false;
}