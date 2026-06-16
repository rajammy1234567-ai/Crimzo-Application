const router = require('express').Router();

const page = (title, body) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — Crimzo</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #0a0a0f; color: #eee; line-height: 1.6; }
    h1 { color: #ff2d55; font-size: 1.5rem; }
    h2 { color: #fff; font-size: 1.1rem; margin-top: 1.5rem; }
    p, li { color: #bbb; }
    a { color: #ff6b8a; }
  </style>
</head>
<body>${body}<p style="margin-top:2rem;color:#666;font-size:0.85rem;">© 2026 Crimzo. support@crimzo.app</p></body>
</html>`;

router.get('/privacy', (_req, res) => {
  res.type('html').send(page('Privacy Policy', `
    <h1>Privacy Policy</h1>
    <p>Last updated: June 2026</p>
    <h2>Information we collect</h2>
    <p>Account details (email, username, profile photo), content you upload (reels, stories, messages), and usage data to improve the app.</p>
    <h2>How we use data</h2>
    <ul><li>To provide social, live streaming, and messaging features</li><li>To process payments via Razorpay</li><li>To send notifications you opt into</li></ul>
    <h2>Sharing</h2>
    <p>We do not sell your personal data. Media may be stored on Cloudinary; payments are handled by Razorpay under their policies.</p>
    <h2>Your rights</h2>
    <p>Contact <a href="mailto:support@crimzo.app">support@crimzo.app</a> to request data deletion or account removal.</p>
  `));
});

router.get('/terms', (_req, res) => {
  res.type('html').send(page('Terms of Service', `
    <h1>Terms of Service</h1>
    <p>Last updated: June 2026</p>
    <h2>Using Crimzo</h2>
    <p>You must be 13+ and follow community guidelines. Do not post illegal, hateful, or harmful content.</p>
    <h2>Virtual items</h2>
    <p>Diamonds, beans, and gifts have no cash value outside the app. Purchases are final except where required by law.</p>
    <h2>Content</h2>
    <p>You retain ownership of your content but grant Crimzo a license to display it within the service.</p>
    <h2>Termination</h2>
    <p>We may suspend accounts that violate these terms. You may delete your account by contacting support.</p>
  `));
});

module.exports = router;