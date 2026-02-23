#!/usr/bin/env node
/**
 * Weather-aware watering schedule adjuster.
 * Checks Open-Meteo forecast and recent rain, adjusts next_watering dates.
 * 
 * Rules:
 * - If >10mm rain in past 3 days → push all next_watering out by 3 days
 * - If >5mm rain in past 3 days → push out by 2 days  
 * - If heat wave coming (>32°C / 90°F) → pull high-water plants forward by 1-2 days
 * - Winter (Dec-Feb): increase intervals by 50%
 * - Summer (Jun-Sep): decrease intervals by 25% for medium/high water plants
 * 
 * Usage: node adjust-watering.js [--dry-run]
 */
const { Pool } = require('pg');
const https = require('https');

const pool = new Pool({ user: 'ashcroft', database: 'ashcroft_app', host: '/var/run/postgresql' });
const dryRun = process.argv.includes('--dry-run');

const LAT = 37.3688, LON = -122.0363;

function fetchWeather() {
  return new Promise((resolve, reject) => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,precipitation_sum,rain_sum&timezone=America/Los_Angeles&past_days=7&forecast_days=7`;
    https.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function getSeason() {
  const month = new Date().getMonth(); // 0-indexed
  if (month >= 5 && month <= 8) return 'summer'; // Jun-Sep
  if (month >= 11 || month <= 1) return 'winter'; // Dec-Feb
  return 'transition'; // Mar-May, Oct-Nov
}

async function main() {
  console.log(`[watering-adjust] Starting${dryRun ? ' (DRY RUN)' : ''}...`);
  
  const weather = await fetchWeather();
  const daily = weather.daily;
  const today = new Date().toISOString().split('T')[0];
  const todayIdx = daily.time.indexOf(today);
  
  // Recent rain (past 3 days)
  const recentRain = daily.rain_sum.slice(Math.max(0, todayIdx - 3), todayIdx + 1).reduce((a, b) => a + b, 0);
  
  // Upcoming rain (next 3 days)
  const upcomingRain = daily.rain_sum.slice(todayIdx + 1, todayIdx + 4).reduce((a, b) => a + b, 0);
  
  // Max temp in next 5 days
  const upcomingMaxTemp = Math.max(...daily.temperature_2m_max.slice(todayIdx, todayIdx + 5));
  
  const season = getSeason();
  
  console.log(`[watering-adjust] Recent rain (3d): ${recentRain.toFixed(1)}mm`);
  console.log(`[watering-adjust] Upcoming rain (3d): ${upcomingRain.toFixed(1)}mm`);
  console.log(`[watering-adjust] Max temp (5d): ${upcomingMaxTemp.toFixed(1)}°C`);
  console.log(`[watering-adjust] Season: ${season}`);
  
  // Calculate adjustment days
  let pushDays = 0;
  let reason = '';
  
  if (recentRain > 10) {
    pushDays = 3;
    reason = `Heavy recent rain (${recentRain.toFixed(0)}mm in 3 days)`;
  } else if (recentRain > 5) {
    pushDays = 2;
    reason = `Moderate recent rain (${recentRain.toFixed(0)}mm in 3 days)`;
  } else if (upcomingRain > 10) {
    pushDays = 2;
    reason = `Heavy rain forecast (${upcomingRain.toFixed(0)}mm in next 3 days)`;
  } else if (upcomingRain > 5) {
    pushDays = 1;
    reason = `Rain forecast (${upcomingRain.toFixed(0)}mm in next 3 days)`;
  }
  
  // Heat wave adjustment (pull forward)
  let pullDays = 0;
  let heatReason = '';
  if (upcomingMaxTemp > 32) {
    pullDays = 2;
    heatReason = `Heat wave coming (${upcomingMaxTemp.toFixed(0)}°C)`;
  } else if (upcomingMaxTemp > 28) {
    pullDays = 1;
    heatReason = `Warm spell (${upcomingMaxTemp.toFixed(0)}°C)`;
  }
  
  const netAdjust = pushDays - pullDays;
  
  if (netAdjust === 0) {
    console.log('[watering-adjust] No adjustment needed. Schedule looks good.');
    await pool.end();
    return;
  }
  
  console.log(`[watering-adjust] Adjustment: ${netAdjust > 0 ? '+' : ''}${netAdjust} days`);
  if (reason) console.log(`[watering-adjust] Rain reason: ${reason}`);
  if (heatReason) console.log(`[watering-adjust] Heat reason: ${heatReason}`);
  
  // Snap to nearest weekend (Sat=6, Sun=0) helper
  function snapToWeekend(date) {
    const d = new Date(date);
    const day = d.getDay();
    // If already Sat(6) or Sun(0), keep it
    if (day === 0 || day === 6) return d;
    // Find nearest: Sat before or Sun after
    const toSat = (day + 1) % 7; // days until previous Saturday (backwards)
    const toSun = 7 - day; // days until next Sunday
    if (toSun <= 3) { d.setDate(d.getDate() + toSun); }
    else { d.setDate(d.getDate() + (7 - toSat)); }
    return d;
  }

  if (!dryRun) {
    // Get plants due within 7 days, adjust and snap to weekend
    const plants = await pool.query(
      `SELECT id, name, next_watering FROM garden_plants 
       WHERE next_watering IS NOT NULL 
         AND next_watering BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'`
    );
    let updated = 0;
    for (const p of plants.rows) {
      const adjusted = new Date(p.next_watering);
      adjusted.setDate(adjusted.getDate() + netAdjust);
      const snapped = snapToWeekend(adjusted);
      await pool.query('UPDATE garden_plants SET next_watering = $1, updated_at = NOW() WHERE id = $2', 
        [snapped.toISOString().split('T')[0], p.id]);
      console.log(`  ${p.name} → ${snapped.toISOString().split('T')[0]} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][snapped.getDay()]})`);
      updated++;
    }
    console.log(`[watering-adjust] Updated ${updated} plants (snapped to weekends).`);
  } else {
    const plants = await pool.query(
      `SELECT name, next_watering FROM garden_plants 
       WHERE next_watering IS NOT NULL 
         AND next_watering BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
       ORDER BY next_watering`
    );
    console.log(`[watering-adjust] Would adjust ${plants.rows.length} plants:`);
    plants.rows.forEach(p => {
      const adjusted = new Date(p.next_watering);
      adjusted.setDate(adjusted.getDate() + netAdjust);
      const snapped = snapToWeekend(adjusted);
      console.log(`  ${p.name}: ${p.next_watering.toISOString().split('T')[0]} → ${snapped.toISOString().split('T')[0]} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][snapped.getDay()]})`);
    });
  }
  
  await pool.end();
  console.log('[watering-adjust] Done.');
}

main().catch(err => {
  console.error('[watering-adjust] Error:', err);
  process.exit(1);
});
