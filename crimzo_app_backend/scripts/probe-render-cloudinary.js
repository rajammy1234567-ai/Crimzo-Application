/**
 * Detect which Cloudinary cloud Render is actually using by uploading a tiny image.
 * Usage: node scripts/probe-render-cloudinary.js
 */
const BASE = process.env.PROBE_BASE_URL || 'https://crimzo-application-backend.onrender.com';

// Valid minimal 1x1 JPEG
const JPEG = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01,
  0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08,
  0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
  0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20,
  0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27,
  0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
  0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xc4, 0x00, 0x14,
  0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0xff, 0xd9,
]);

function cloudFromUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const m = url.match(/res\.cloudinary\.com\/([a-z0-9_-]+)\//i);
  return m ? m[1] : null;
}

function pickUrl(obj) {
  if (!obj || typeof obj !== 'object') return null;
  return (
    obj.avatar ||
    obj.mediaUrl ||
    obj.media_url ||
    obj.secure_url ||
    obj.url ||
    obj.videoUrl ||
    obj.video_url ||
    obj.story?.mediaUrl ||
    obj.story?.media_url ||
    obj.user?.avatar ||
    obj.reel?.video_url ||
    null
  );
}

async function main() {
  console.log('Probing', BASE);

  const loginRes = await fetch(`${BASE}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
  });
  const login = await loginRes.json();
  const token = login.token;
  if (!token) {
    console.error('Guest login failed', loginRes.status, login);
    process.exit(1);
  }
  console.log('Auth OK:', login.user?.username || login.username || 'guest');

  // Feed — what users currently see
  const feedRes = await fetch(`${BASE}/api/reels/feed?limit=5&mode=foryou`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const feed = await feedRes.json();
  const reels = feed.reels || [];
  console.log('\n=== FEED (existing reels) ===');
  console.log('count:', reels.length);
  const feedClouds = {};
  for (const r of reels.slice(0, 5)) {
    const url = r.video_url;
    const cloud = cloudFromUrl(url);
    feedClouds[cloud || 'unknown'] = (feedClouds[cloud || 'unknown'] || 0) + 1;
    let status = '?';
    try {
      status = String((await fetch(url, { method: 'HEAD' })).status);
    } catch {
      status = 'err';
    }
    console.log(`- ${r.id} cloud=${cloud} HEAD=${status}`);
  }
  console.log('feed clouds summary:', feedClouds);

  // Avatar upload — reveals which cloud Render writes to
  console.log('\n=== UPLOAD PROBE (avatar) ===');
  const form = new FormData();
  form.append('avatar', new Blob([JPEG], { type: 'image/jpeg' }), 'probe.jpg');
  // flexibleSingle may accept any field name
  form.append('file', new Blob([JPEG], { type: 'image/jpeg' }), 'probe.jpg');
  form.append('image', new Blob([JPEG], { type: 'image/jpeg' }), 'probe.jpg');
  form.append('media', new Blob([JPEG], { type: 'image/jpeg' }), 'probe.jpg');

  const avRes = await fetch(`${BASE}/api/user/avatar`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const avText = await avRes.text();
  let avJson;
  try {
    avJson = JSON.parse(avText);
  } catch {
    avJson = { raw: avText.slice(0, 400) };
  }
  console.log('avatar status:', avRes.status);
  console.log('avatar body:', JSON.stringify(avJson).slice(0, 500));

  const uploadedUrl = pickUrl(avJson) || (avText.match(/https?:\/\/res\.cloudinary\.com\/[^"'\s]+/i) || [])[0];
  const renderCloud = cloudFromUrl(uploadedUrl);
  if (renderCloud) {
    console.log('\n========================================');
    console.log('RENDER CLOUDINARY_CLOUD_NAME =', renderCloud);
    console.log('uploaded URL =', uploadedUrl);
    try {
      const head = await fetch(uploadedUrl, { method: 'HEAD' });
      console.log('uploaded HEAD status =', head.status, '(200 = playable)');
    } catch (e) {
      console.log('uploaded HEAD err', e.message);
    }
    console.log('========================================');
  } else {
    console.log('\nCould not detect cloud from avatar upload.');
    // Story upload fallback
    const sform = new FormData();
    sform.append('media', new Blob([JPEG], { type: 'image/jpeg' }), 'probe.jpg');
    sform.append('caption', 'cloud-probe');
    const sRes = await fetch(`${BASE}/api/stories/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: sform,
    });
    const sText = await sRes.text();
    console.log('story status:', sRes.status, sText.slice(0, 400));
    const m = sText.match(/res\.cloudinary\.com\/([a-z0-9_-]+)\//i);
    if (m) {
      console.log('\n>>> RENDER CLOUDINARY_CLOUD_NAME =', m[1]);
    } else {
      console.log('Story also failed to reveal cloud name.');
      if (/disabled customer|Unauthorized|401/i.test(sText + avText)) {
        console.log('HINT: Render still looks like DISABLED cloud (dxyvn9gig) credentials.');
      }
    }
  }

  // Local comparison
  console.log('\n=== LOCAL CLOUDS QUICK CHECK ===');
  for (const c of ['dxyvn9gig', 'ezqeecls']) {
    try {
      const r = await fetch(`https://res.cloudinary.com/${c}/image/upload/sample.jpg`, { method: 'HEAD' });
      console.log(`${c}: public sample HEAD ${r.status}`);
    } catch (e) {
      console.log(`${c}: err ${e.message}`);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
