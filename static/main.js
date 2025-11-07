// Compute the correct manifest URL and Stremio deep link at runtime
// This avoids hardcoding host/port and works in local and deployed environments.
(function () {
  function buildManifestHttpUrl() {
    try {
      return window.location.origin + '/manifest.json';
    } catch (_) {
      return '/manifest.json';
    }
  }

  function buildStremioDeepLink() {
    try {
      // Official pattern: replace leading https:// with stremio://
      // For local dev (http), we still use host and path.
      return 'stremio://' + window.location.host + '/manifest.json';
    } catch (_) {
      return 'stremio://localhost:7000/manifest.json';
    }
  }

  function init() {
    var manifestUrlEl = document.getElementById('manifest-url');
    if (manifestUrlEl) {
      manifestUrlEl.textContent = buildManifestHttpUrl();
    }

    var openBtn = document.getElementById('open-stremio');
    if (openBtn) {
      var deepLink = buildStremioDeepLink();
      openBtn.setAttribute('href', deepLink);
      // Optional: provide a graceful fallback in case the protocol isn't handled
      openBtn.addEventListener('click', function (e) {
        // Let the browser try the deep link first; if it fails, we can show info
        // Some browsers may do nothing if protocol handler is missing; no-op here to avoid popups
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();