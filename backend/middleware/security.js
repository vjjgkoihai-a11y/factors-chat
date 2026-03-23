function applySecurity(app) {
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), fullscreen=(self), microphone=(self)');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self' https: data: blob:",
        "script-src 'self' 'unsafe-inline' https://www.youtube.com https://s.ytimg.com https://www.google.com https://apis.google.com https://www.gstatic.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src 'self' https://fonts.gstatic.com data:",
        "img-src 'self' https: data: blob:",
        "media-src 'self' blob: data:",
        "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com",
        "connect-src 'self' ws: wss: https://suggestqueries.google.com https://www.youtube.com",
        "object-src 'none'",
        "base-uri 'self'"
      ].join('; ')
    );
    next();
  });
}

module.exports = { applySecurity };
