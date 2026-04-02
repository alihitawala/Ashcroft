const { chromium } = require('playwright');
const crypto = require('crypto');

const BASE = 'https://ashcroft.cloud';
const FFMPEG = '/home/ashcroft/www/node_modules/@ffmpeg-installer/linux-x64/ffmpeg';
const VIDEO_OUT = '/home/ashcroft/.openclaw/media/signup-e2e-complete.mp4';

(async () => {
  const { pool } = require('../server/db');
  const code = crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
  const code2 = crypto.randomBytes(6).toString('base64url').slice(0, 8).toUpperCase();
  const testEmail = `test-${Date.now()}@example.com`;
  const testName = 'E2E Tester';
  const testPassword = 'TestPass123!';
  const testHousehold = 'E2E Household';
  const customHousehold = 'My Custom Home';

  // Create invite codes
  await pool.query(
    `INSERT INTO invite_codes (code, created_by, household_name, expires_at) VALUES ($1, 1, $2, NOW() + INTERVAL '1 hour')`,
    [code, testHousehold]
  );
  await pool.query(
    `INSERT INTO invite_codes (code, created_by, household_name, expires_at) VALUES ($1, 1, 'URL Param Test', NOW() + INTERVAL '1 hour')`,
    [code2]
  );
  console.log(`✅ Invite codes: ${code}, ${code2}`);

  const browser = await chromium.launch({ headless: true });
  const videoDir = '/home/ashcroft/www/tests/videos/';
  require('fs').mkdirSync(videoDir, { recursive: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
  });
  const page = await context.newPage();

  let passed = 0, failed = 0;
  function assert(condition, name) {
    if (condition) { console.log(`  ✅ ${name}`); passed++; }
    else { console.log(`  ❌ ${name}`); failed++; }
  }

  try {
    // ═══ SIGNUP PAGE UI ═══
    console.log('\n🧪 Test 1: Signup page loads with polished UI');
    await page.goto(`${BASE}/app/signup.html`, { waitUntil: 'networkidle' });
    assert(await page.isVisible('.login-card'), 'Signup card visible');
    assert(await page.isVisible('#inviteCode'), 'Invite code input visible');
    // Labels should be visually distinct from inputs
    const labelColor = await page.$eval('.login-form label', el => getComputedStyle(el).fontWeight);
    assert(parseInt(labelColor) >= 600, `Labels are bold (weight: ${labelColor})`);
    const inputBg = await page.$eval('.form-input', el => getComputedStyle(el).backgroundColor);
    assert(inputBg && inputBg !== 'transparent', `Inputs have background: ${inputBg}`);
    const inputBorderWidth = await page.$eval('.form-input', el => getComputedStyle(el).borderWidth);
    assert(inputBorderWidth && inputBorderWidth !== '0px', `Inputs have border: ${inputBorderWidth}`);

    // ═══ INVALID CODE ═══
    console.log('\n🧪 Test 2: Invalid code → error, no fields');
    await page.fill('#inviteCode', 'BADCODE1');
    await page.waitForTimeout(800);
    await page.waitForSelector('.invite-status.invalid', { timeout: 5000 });
    const invalidText = await page.textContent('.invite-status.invalid');
    assert(invalidText.includes('Invalid'), 'Shows invalid message');
    assert(!(await page.isVisible('#signupFields.visible')), 'Signup fields hidden');

    // ═══ VALID CODE ═══
    console.log('\n🧪 Test 3: Valid code → fields + button + household name');
    await page.fill('#inviteCode', '');
    await page.fill('#inviteCode', code);
    await page.waitForTimeout(800);
    await page.waitForSelector('.invite-status.valid', { timeout: 5000 });
    const validText = await page.textContent('.invite-status.valid');
    assert(validText.includes('Valid'), 'Shows valid message');
    assert(validText.includes(testHousehold), 'Shows household name');
    assert(await page.isVisible('#signupFields'), 'Signup fields visible');
    assert(await page.isVisible('#name'), 'Name input visible');
    assert(await page.isVisible('#email'), 'Email input visible');
    assert(await page.isVisible('#password'), 'Password input visible');
    // Household name field prefilled
    assert(await page.isVisible('#householdName'), 'Household name input visible');
    const hnVal = await page.inputValue('#householdName');
    assert(hnVal === testHousehold, `Household prefilled: "${hnVal}"`);

    // ═══ CTA BUTTON VISIBLE ═══
    console.log('\n🧪 Test 4: Create Account button visible');
    const btn = page.locator('#signupBtn');
    assert(await btn.isVisible(), 'Create Account button VISIBLE');
    const btnText = await btn.textContent();
    assert(btnText.trim() === 'Create Account', `Button text: "${btnText.trim()}"`);

    // ═══ PASSWORD REQUIREMENTS ═══
    console.log('\n🧪 Test 5: Password requirements shown');
    assert(await page.isVisible('#passwordHint'), 'Password hint visible');
    const hintText = await page.textContent('#passwordHint');
    assert(hintText.includes('8 characters'), `Hint shows requirement: "${hintText}"`);

    // Type short password
    await page.fill('#password', 'abc');
    await page.waitForTimeout(100);
    const shortHint = await page.textContent('#passwordHint');
    assert(shortHint.includes('more character'), `Short pw hint: "${shortHint}"`);
    // Button disabled with short password
    const btnDisabledShort = await btn.getAttribute('disabled');
    assert(btnDisabledShort !== null, 'Button disabled with short password');

    // Type valid password
    await page.fill('#password', testPassword);
    await page.waitForTimeout(100);
    const okHint = await page.textContent('#passwordHint');
    assert(okHint.includes('OK') || okHint.includes('✅'), `Valid pw hint: "${okHint}"`);
    const btnEnabled = await btn.getAttribute('disabled');
    assert(btnEnabled === null, 'Button enabled with valid password');

    // ═══ CUSTOM HOUSEHOLD NAME ═══
    console.log('\n🧪 Test 6: Edit household name during signup');
    await page.fill('#householdName', customHousehold);

    // ═══ COMPLETE SIGNUP ═══
    console.log('\n🧪 Test 7: Complete signup → dashboard');
    await page.fill('#name', testName);
    await page.fill('#email', testEmail);
    await page.waitForTimeout(500);
    await btn.click();
    await page.waitForURL('**/dashboard.html', { timeout: 10000 });
    assert(page.url().includes('dashboard.html'), 'Redirected to dashboard');

    // ═══ DASHBOARD: NON-ASHCROFT HIDDEN WIDGETS ═══
    console.log('\n🧪 Test 8: Dashboard hides Captures/Events for non-Ashcroft');
    await page.waitForTimeout(2000); // let dashboard load
    const capturesWidget = await page.$('.widget-captures');
    assert(!capturesWidget, 'Captures widget NOT shown');
    const eventsWidget = await page.$('.widget-events');
    assert(!eventsWidget, 'Events widget NOT shown');
    // Tasks and garden should still be visible (they're in visible_pages for non-Ashcroft)
    // Quick actions should NOT have capture button
    const captureQA = await page.$('.qa-capture');
    assert(!captureQA, 'Capture quick action NOT shown');

    // ═══ GARDEN: NO ALI'S ZONES ═══
    console.log('\n🧪 Test 9: Garden shows no zones for new household');
    await page.goto(`${BASE}/app/garden.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    // The new household has no garden zones
    const pageContent = await page.textContent('body');
    assert(!pageContent.includes('Sideyard') && !pageContent.includes('Backyard'),
      'Ali\'s zones (Sideyard/Backyard) NOT shown');

    // ═══ SETTINGS: HOUSEHOLD NAME EDITABLE ═══
    console.log('\n🧪 Test 10: Settings shows editable household name');
    await page.goto(`${BASE}/app/settings.html`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const hnInput = page.locator('#householdNameInput');
    assert(await hnInput.isVisible(), 'Household name input visible in settings');
    const hnSettingsVal = await hnInput.inputValue();
    assert(hnSettingsVal === customHousehold, `Settings shows custom name: "${hnSettingsVal}"`);

    // ═══ URL PARAM AUTO-VALIDATION ═══
    console.log('\n🧪 Test 11: Code from URL param auto-validates');
    await context.clearCookies();
    await page.goto(`${BASE}/app/signup.html?code=${code2}`, { waitUntil: 'networkidle' });
    await page.waitForSelector('.invite-status.valid', { timeout: 5000 });
    const codeVal = await page.inputValue('#inviteCode');
    assert(codeVal === code2, 'Code auto-filled from URL');
    assert(await page.isVisible('.invite-status.valid'), 'Auto-validated as valid');
    assert(await page.isVisible('#signupBtn'), 'Button visible after auto-validate');

    // ═══ NO FOCUS STEALING ═══
    console.log('\n🧪 Test 12: No focus stealing while typing');
    await context.clearCookies();
    await page.goto(`${BASE}/app/signup.html`, { waitUntil: 'networkidle' });
    await page.click('#inviteCode');
    for (const ch of code2) {
      await page.type('#inviteCode', ch, { delay: 100 });
    }
    const focusedId = await page.evaluate(() => document.activeElement?.id);
    assert(focusedId === 'inviteCode', `Focus stayed on inviteCode (was: ${focusedId})`);

  } catch (err) {
    console.error(`\n💥 Test crashed: ${err.message}\n${err.stack}`);
    failed++;
  }

  // Cleanup
  await pool.query(`DELETE FROM invite_codes WHERE code = ANY($1::text[])`, [[code, code2]]);
  await pool.query(`DELETE FROM users WHERE email = $1`, [testEmail]);
  await pool.query(`DELETE FROM households WHERE name IN ($1, $2, 'URL Param Test') AND id NOT IN (SELECT DISTINCT household_id FROM users WHERE household_id IS NOT NULL)`,
    [testHousehold, customHousehold]);

  await page.close();
  const videoPath = await page.video()?.path();
  await context.close();
  await browser.close();

  // Convert webm to mp4
  if (videoPath) {
    const { execSync } = require('child_process');
    try {
      require('fs').mkdirSync('/home/ashcroft/.openclaw/media', { recursive: true });
      execSync(`${FFMPEG} -y -i "${videoPath}" -c:v libx264 -preset fast -crf 23 "${VIDEO_OUT}" 2>/dev/null`);
      console.log(`\n📹 Video saved: ${VIDEO_OUT}`);
    } catch (e) {
      console.log(`⚠️ Video conversion failed: ${e.message}`);
      // Copy raw webm as fallback
      try { require('fs').copyFileSync(videoPath, VIDEO_OUT.replace('.mp4', '.webm')); } catch {}
    }
  }

  await pool.end();

  console.log(`\n${'═'.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'═'.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
})();
