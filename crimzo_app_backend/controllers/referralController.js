const User = require('../models/User');
const {
  normalizeReferralCode,
  buildReferralLink,
  findReferrerByCode,
  getReferralStatsForUser,
  REFERRAL_REWARD_INR,
  REFERRAL_REWARD_DIAMONDS,
  REFERRED_USER_REWARD_INR,
  REFERRED_USER_REWARD_DIAMONDS,
} = require('../utils/referralService');
const { APP_DOWNLOAD_URL, REFERRAL_WEB_BASE_URL } = require('../config/referralConfig');

exports.getMyReferral = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('crimzo_id');
    if (!user?.crimzo_id) {
      return res.status(400).json({ error: 'Referral ID not ready yet. Try again in a moment.' });
    }

    const stats = await getReferralStatsForUser(req.user.id);
    res.json({
      success: true,
      inviteCode: `CRIMZO-${user.crimzo_id}`,
      ...stats,
    });
  } catch (error) {
    console.error('Get referral error:', error);
    res.status(500).json({ error: 'Failed to load referral info' });
  }
};

exports.validateReferralCode = async (req, res) => {
  try {
    const code = normalizeReferralCode(req.params.code || req.query.code || '');
    if (!code) {
      return res.status(400).json({ valid: false, error: 'Referral code required' });
    }

    const referrer = await findReferrerByCode(code);
    if (!referrer || referrer.is_banned) {
      return res.json({ valid: false, error: 'Invalid referral code' });
    }

    res.json({
      valid: true,
      referralCode: code,
      referrer: {
        username: referrer.username,
        avatar: referrer.avatar,
      },
      rewardPerReferralInr: REFERRAL_REWARD_INR,
      rewardPerReferralDiamonds: REFERRAL_REWARD_DIAMONDS,
      referredUserRewardInr: REFERRED_USER_REWARD_INR,
      referredUserRewardDiamonds: REFERRED_USER_REWARD_DIAMONDS,
    });
  } catch (error) {
    console.error('Validate referral error:', error);
    res.status(500).json({ valid: false, error: 'Could not validate referral code' });
  }
};

exports.renderInviteLandingPage = async (req, res) => {
  try {
    const code = normalizeReferralCode(req.params.code || '');
    const referrer = code ? await findReferrerByCode(code) : null;
    const valid = !!(referrer && !referrer.is_banned);
    const appDeepLink = code ? `crimzo://invite/${code}` : 'crimzo://';
    const displayName = valid ? referrer.username : 'Crimzo';
    const avatar = valid && referrer.avatar
      ? referrer.avatar
      : `${REFERRAL_WEB_BASE_URL}/favicon.ico`;

    res.type('html').send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Join ${displayName} on Crimzo</title>
  <meta property="og:title" content="Join ${displayName} on Crimzo" />
  <meta property="og:description" content="Sign up on Crimzo with referral code ${code || ''}. You get ${REFERRED_USER_REWARD_DIAMONDS.toLocaleString('en-IN')} diamonds and ${displayName} gets ${REFERRAL_REWARD_DIAMONDS.toLocaleString('en-IN')} diamonds!" />
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; min-height: 100vh; background: linear-gradient(160deg, #06060f 0%, #141428 100%); color: #eee; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { max-width: 420px; width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,45,85,0.25); border-radius: 20px; padding: 28px; text-align: center; }
    .avatar { width: 72px; height: 72px; border-radius: 50%; object-fit: cover; border: 2px solid #ff2d55; margin-bottom: 16px; }
    h1 { color: #fff; font-size: 1.35rem; margin: 0 0 8px; }
    p { color: #aaa; line-height: 1.55; margin: 0 0 16px; }
    .code { display: inline-block; background: #1a1a2e; border: 1px dashed rgba(255,45,85,0.5); color: #ff6b8a; padding: 10px 16px; border-radius: 12px; font-weight: 700; letter-spacing: 1px; margin-bottom: 20px; }
    .btn { display: block; width: 100%; text-decoration: none; border-radius: 14px; padding: 14px 18px; font-weight: 700; margin-bottom: 12px; }
    .btn-primary { background: linear-gradient(90deg, #ff2d55, #ff6b35); color: #fff; }
    .btn-secondary { background: rgba(255,255,255,0.08); color: #fff; border: 1px solid rgba(255,255,255,0.12); }
    .reward { color: #7dffb2; font-size: 0.95rem; }
    .invalid { color: #ff8a8a; }
  </style>
</head>
<body>
  <div class="card">
    ${valid ? `<img class="avatar" src="${avatar}" alt="${displayName}" onerror="this.style.display='none'" />` : ''}
    <h1>${valid ? `${displayName} invited you!` : 'Join Crimzo'}</h1>
    ${valid
      ? `<p>Download Crimzo from <strong>www.crimzo.live</strong> and sign up with this referral ID.</p>
         <p class="reward">You get ${REFERRED_USER_REWARD_DIAMONDS.toLocaleString('en-IN')} diamonds · ${displayName} gets ${REFERRAL_REWARD_DIAMONDS.toLocaleString('en-IN')} diamonds</p>
         <div class="code">CRIMZO-${code}</div>`
      : `<p class="invalid">This invite link is invalid or expired. You can still download Crimzo from www.crimzo.live.</p>`}
    <a class="btn btn-primary" href="${APP_DOWNLOAD_URL}" id="downloadApp">Download from crimzo.live</a>
    <a class="btn btn-secondary" href="${appDeepLink}" id="openApp">Open in Crimzo App</a>
  </div>
  <script>
    (function () {
      var deep = ${JSON.stringify(appDeepLink)};
      var download = ${JSON.stringify(APP_DOWNLOAD_URL)};
      var isAndroid = /Android/i.test(navigator.userAgent);
      if (isAndroid && deep) {
        setTimeout(function () { window.location.href = deep; }, 400);
        setTimeout(function () { /* stay on page if app missing */ }, 2500);
      }
      document.getElementById('openApp').addEventListener('click', function (e) {
        e.preventDefault();
        window.location.href = deep;
        setTimeout(function () { if (isAndroid) window.location.href = download; }, 1500);
      });
    })();
  </script>
</body>
</html>`);
  } catch (error) {
    console.error('Invite landing page error:', error);
    res.status(500).send('Unable to load invite page');
  }
};