require('dotenv').config();
const express    = require('express');
const { Pool }   = require('pg');
const cors       = require('cors');
const path       = require('path');
const nodemailer = require('nodemailer');
const bcrypt = require('bcryptjs');
const crypto     = require('crypto');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── DB ───────────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
pool.query('SELECT NOW()', (err, res) => {
  if (err) console.error('❌ DB zlyhala:', err.message);
  else     console.log ('✅ DB pripojená:', res.rows[0].now);
});
async function q(text, params = []) {
  const c = await pool.connect();
  try { return await c.query(text, params); }
  finally { c.release(); }
}

// ── EMAIL ────────────────────────────────────────────────────
// Port 465 = secure:true (SSL), Port 587 = secure:false (STARTTLS)
const emailPort = parseInt(process.env.EMAIL_PORT || '465');
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp.centrum.sk',
  port: emailPort,
  secure: emailPort === 465,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: { rejectUnauthorized: false }
});

// Overenie emailového spojenia pri štarte
transporter.verify((err) => {
  if (err) {
    console.warn('⚠️  Email chyba:', err.message);
    console.warn('   HOST:', process.env.EMAIL_HOST, '| PORT:', process.env.EMAIL_PORT, '| USER:', process.env.EMAIL_USER);
  } else {
    console.log('✅ Email pripravený –', process.env.EMAIL_USER);
  }
});

async function posliEmail({ to, subject, html }) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return;
  try {
    await transporter.sendMail({
      from: `"Chata Lechnica" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log('📧 Email odoslaný →', to);
  } catch (e) {
    console.error('❌ Email zlyhal:', e.message);
  }
}

// ── EMAIL ŠABLÓNY ────────────────────────────────────────────
function emailRezervacia({ meno, email, telefon, datum_od, datum_do, pocet_osob, poznamka, cena_celkom, zaloha_suma, id }) {
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1a3a1c;padding:24px;text-align:center">
      <h1 style="color:#c9a84c;margin:0;font-size:22px">🏠 Chata Lechnica</h1>
      <p style="color:rgba(255,255,255,0.7);margin:4px 0 0">Nová rezervácia</p>
    </div>
    <div style="padding:24px;background:#f5f0e8">
      <h2 style="color:#1a3a1c;margin-top:0">Nová rezervácia #${id ? id.slice(0,8) : 'N/A'}</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#5a6b5c;width:40%">👤 Hosť</td><td style="padding:8px 0;font-weight:600">${meno}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b5c">✉️ Email</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#5a6b5c">📞 Telefón</td><td style="padding:8px 0">${telefon || '–'}</td></tr>
        <tr style="background:rgba(0,0,0,0.04)"><td style="padding:8px 6px;color:#5a6b5c">📅 Príchod</td><td style="padding:8px 6px;font-weight:600">${datum_od}</td></tr>
        <tr style="background:rgba(0,0,0,0.04)"><td style="padding:8px 6px;color:#5a6b5c">📅 Odchod</td><td style="padding:8px 6px;font-weight:600">${datum_do}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b5c">👥 Osôb</td><td style="padding:8px 0">${pocet_osob}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b5c">💶 Cena celkom</td><td style="padding:8px 0;font-weight:600;color:#1a3a1c">€${cena_celkom || '–'}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b5c">💰 Záloha (30%)</td><td style="padding:8px 0;font-weight:600;color:#c9a84c">€${zaloha_suma || '–'}</td></tr>
        ${poznamka ? `<tr><td style="padding:8px 0;color:#5a6b5c">💬 Poznámka</td><td style="padding:8px 0;font-style:italic">${poznamka}</td></tr>` : ''}
      </table>
    </div>
    <div style="padding:16px 24px;background:#1a3a1c;text-align:center">
      <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0">Chata Lechnica · chata.lechnica@gmail.com</p>
    </div>
  </div>`;
}

function emailPotvrdenie({ meno, datum_od, datum_do, pocet_osob, cena_celkom, zaloha_suma }) {
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1a3a1c;padding:24px;text-align:center">
      <h1 style="color:#c9a84c;margin:0;font-size:22px">🏠 Chata Lechnica</h1>
    </div>
    <div style="padding:24px;background:#f5f0e8">
      <h2 style="color:#1a3a1c">Ďakujeme za váš dopyt, ${meno}!</h2>
      <p style="color:#5a6b5c">Dostali sme vašu žiadosť o rezerváciu. Potvrdíme dostupnosť termínu <strong>do 24 hodín</strong>.</p>
      <div style="background:white;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:4px 0;color:#5a6b5c">📅 <strong>${datum_od}</strong> → <strong>${datum_do}</strong></p>
        <p style="margin:4px 0;color:#5a6b5c">👥 Počet osôb: <strong>${pocet_osob}</strong></p>
        ${cena_celkom ? `<p style="margin:4px 0;color:#5a6b5c">💶 Orientačná cena: <strong>€${cena_celkom}</strong></p>` : ''}
        ${zaloha_suma ? `<p style="margin:4px 0;color:#c9a84c">💰 Záloha: <strong>€${zaloha_suma}</strong></p>` : ''}
      </div>
      <p style="color:#5a6b5c">V prípade otázok nás kontaktujte:<br>
        📞 <a href="tel:+421905123456">+421 905 123 456</a><br>
        ✉️ <a href="mailto:chata.lechnica@gmail.com">chata.lechnica@gmail.com</a>
      </p>
    </div>
    <div style="padding:16px 24px;background:#1a3a1c;text-align:center">
      <p style="color:rgba(255,255,255,0.5);font-size:12px;margin:0">Chata Lechnica · Lechnica, Pieniny, Slovensko</p>
    </div>
  </div>`;
}

function emailSprava({ meno, email, telefon, predmet, text }) {
  return `
  <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
    <div style="background:#1a3a1c;padding:24px;text-align:center">
      <h1 style="color:#c9a84c;margin:0;font-size:22px">🏠 Chata Lechnica</h1>
      <p style="color:rgba(255,255,255,0.7);margin:4px 0 0">Nová správa z webu</p>
    </div>
    <div style="padding:24px;background:#f5f0e8">
      <h2 style="color:#1a3a1c;margin-top:0">Správa: ${predmet || 'bez predmetu'}</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#5a6b5c;width:30%">👤 Meno</td><td style="padding:8px 0;font-weight:600">${meno}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b5c">✉️ Email</td><td style="padding:8px 0"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#5a6b5c">📞 Telefón</td><td style="padding:8px 0">${telefon || '–'}</td></tr>
      </table>
      <div style="background:white;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #c9a84c">
        <p style="margin:0;color:#1e2820">${text.replace(/\n/g, '<br>')}</p>
      </div>
      <a href="mailto:${email}?subject=Re: ${encodeURIComponent(predmet || 'Vaša správa')}"
         style="display:inline-block;background:#2d5e30;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:600">
        ↩ Odpovedať
      </a>
    </div>
  </div>`;
}

// ════════════════════════════════════════════════════════════
//  API ENDPOINTY
// ════════════════════════════════════════════════════════════

// ── CENNÍK ──────────────────────────────────────────────────
app.get('/api/cennik', async (req, res) => {
  try {
    const r = await q(`
      SELECT sezona, nazov, obdobie_popis, cena_za_noc, min_noci, poznamka
      FROM cennik WHERE aktivny = TRUE
      ORDER BY CASE sezona
        WHEN 'mimo_sezonu' THEN 1 WHEN 'jar_jesen' THEN 2
        WHEN 'hlavna' THEN 3 WHEN 'sviatky' THEN 4 END`);
    res.json({ cennik: r.rows });
  } catch (e) { res.status(500).json({ chyba: 'Chyba cenníka.' }); }
});

// ── DOSTUPNOSŤ ──────────────────────────────────────────────
app.get('/api/dostupnost', async (req, res) => {
  const { od, do: _do } = req.query;
  try {
    const r = await q(`
      SELECT datum_od::text, datum_do::text FROM rezervacia
      WHERE status NOT IN ('zrusena')
        AND daterange(datum_od, datum_do) && daterange($1::date, $2::date)
      UNION
      SELECT datum_od::text, (datum_do+1)::text FROM blokovane_terminy
      WHERE daterange(datum_od, datum_do+1) && daterange($1::date, $2::date)
      ORDER BY datum_od`,
      [od || new Date().toISOString().split('T')[0],
       _do || new Date(Date.now()+90*864e5).toISOString().split('T')[0]]
    );
    res.json({ obsadene: r.rows });
  } catch (e) { res.status(500).json({ chyba: 'Chyba dostupnosti.' }); }
});

app.get('/api/dostupnost/over', async (req, res) => {
  const { od, do: _do } = req.query;
  if (!od || !_do) return res.status(400).json({ chyba: 'Chýba od/do.' });
  try {
    const r = await q(`SELECT je_termin_volny($1::date,$2::date) AS volny`, [od, _do]);
    res.json({ volny: r.rows[0].volny });
  } catch (e) { res.status(500).json({ chyba: 'Chyba overenia.' }); }
});

// ── REZERVÁCIA ──────────────────────────────────────────────
app.post('/api/rezervacia', async (req, res) => {
  const { meno, email, telefon, datum_od, datum_do, pocet_osob, poznamka } = req.body;
  if (!meno || !email || !datum_od || !datum_do || !pocet_osob)
    return res.status(400).json({ chyba: 'Vyplňte všetky povinné polia.' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const d = await client.query(
      `SELECT je_termin_volny($1::date,$2::date) AS volny`, [datum_od, datum_do]);
    if (!d.rows[0].volny) {
      await client.query('ROLLBACK');
      return res.status(409).json({ chyba: 'Termín je obsadený.' });
    }
    const h = await client.query(
      `INSERT INTO host (meno,email,telefon) VALUES ($1,$2,$3)
       ON CONFLICT (email) DO UPDATE SET telefon=EXCLUDED.telefon, aktualizovany=NOW()
       RETURNING id`, [meno, email, telefon||null]);
    const r = await client.query(
      `INSERT INTO rezervacia (host_id,datum_od,datum_do,pocet_osob,poznamka_hosta)
       VALUES ($1,$2,$3,$4,$5) RETURNING id,cena_celkom,zaloha_suma`,
      [h.rows[0].id, datum_od, datum_do, pocet_osob, poznamka||null]);
    await client.query('COMMIT');

    const rez = r.rows[0];

    // 📧 Email majiteľovi
    await posliEmail({
      to: process.env.EMAIL_USER,
      subject: `🏠 Nová rezervácia – ${meno} (${datum_od} → ${datum_do})`,
      html: emailRezervacia({ meno, email, telefon, datum_od, datum_do, pocet_osob, poznamka,
        cena_celkom: rez.cena_celkom, zaloha_suma: rez.zaloha_suma, id: rez.id })
    });

    // 📧 Potvrdenie hosťovi
    await posliEmail({
      to: email,
      subject: '✅ Prijali sme vašu rezerváciu – Chata Lechnica',
      html: emailPotvrdenie({ meno, datum_od, datum_do, pocet_osob,
        cena_celkom: rez.cena_celkom, zaloha_suma: rez.zaloha_suma })
    });

    res.status(201).json({
      uspech: true, sprava: 'Rezervácia odoslaná. Potvrdíme do 24 hodín.',
      rezervacia_id: rez.id,
      cena_celkom: rez.cena_celkom,
      zaloha_suma: rez.zaloha_suma
    });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(e);
    res.status(500).json({ chyba: 'Chyba rezervácie.' });
  } finally { client.release(); }
});

// ── KONTAKTNÁ SPRÁVA ────────────────────────────────────────
app.post('/api/sprava', async (req, res) => {
  const { meno, email, telefon, predmet, text } = req.body;
  if (!meno || !email || !text)
    return res.status(400).json({ chyba: 'Vyplňte meno, email a správu.' });
  try {
    await q(`INSERT INTO sprava (meno,email,telefon,predmet,text,ip_adresa)
             VALUES ($1,$2,$3,$4,$5,$6::inet)`,
      [meno, email, telefon||null, predmet||null, text, req.ip]);

    // 📧 Email majiteľovi
    await posliEmail({
      to: process.env.EMAIL_USER,
      subject: `✉️ Nová správa z webu – ${meno}: ${predmet || 'bez predmetu'}`,
      html: emailSprava({ meno, email, telefon, predmet, text })
    });

    res.status(201).json({ uspech: true, sprava: 'Správa odoslaná.' });
  } catch (e) { res.status(500).json({ chyba: 'Chyba správy.' }); }
});

// ── RECENZIE ────────────────────────────────────────────────
app.get('/api/recenzie', async (req, res) => {
  try {
    const r = await q(`
      SELECT id, meno, hodnotenie, text, obdobie_pobytu
      FROM recenzia WHERE schvalena=TRUE AND zobrazit=TRUE
      ORDER BY vytvorena DESC LIMIT 20`);
    res.json({ recenzie: r.rows });
  } catch (e) { res.status(500).json({ chyba: 'Chyba recenzií.' }); }
});

app.post('/api/recenzie', async (req, res) => {
  const { meno, hodnotenie, text, obdobie_pobytu } = req.body;
  if (!text || !hodnotenie) return res.status(400).json({ chyba: 'Chýba text/hodnotenie.' });
  if (hodnotenie < 1 || hodnotenie > 5) return res.status(400).json({ chyba: 'Hodnotenie 1–5.' });
  try {
    await q(`INSERT INTO recenzia (meno,hodnotenie,text,obdobie_pobytu) VALUES ($1,$2,$3,$4)`,
      [meno||'Anonymný hosť', hodnotenie, text, obdobie_pobytu||null]);

    // 📧 Notifikácia majiteľovi
    await posliEmail({
      to: process.env.EMAIL_USER,
      subject: `⭐ Nová recenzia od ${meno||'anonymného hosťa'}`,
      html: `<div style="font-family:sans-serif;padding:20px">
        <h2>Nová recenzia (čaká na schválenie)</h2>
        <p><strong>Od:</strong> ${meno||'Anonymný'}</p>
        <p><strong>Hodnotenie:</strong> ${'★'.repeat(hodnotenie)}${'☆'.repeat(5-hodnotenie)}</p>
        <p><strong>Text:</strong> ${text}</p>
        <p style="color:#888">Schváľ ju v databáze: <code>UPDATE recenzia SET schvalena=TRUE WHERE meno='${meno}';</code></p>
      </div>`
    });

    res.status(201).json({ uspech: true, sprava: 'Ďakujeme! Recenzia sa zobrazí po schválení.' });
  } catch (e) { res.status(500).json({ chyba: 'Chyba recenzie.' }); }
});

// ── GALÉRIA ─────────────────────────────────────────────────
app.get('/api/galeria', async (req, res) => {
  try {
    const r = await q(`SELECT id,nazov,popis,url FROM galeria WHERE aktivny=TRUE ORDER BY poradie ASC`);
    res.json({ obrazky: r.rows });
  } catch (e) { res.status(500).json({ chyba: 'Chyba galérie.' }); }
});

// ════════════════════════════════════════════════════════════
//  ADMIN AUTENTIFIKÁCIA
// ════════════════════════════════════════════════════════════

// ── Middleware – overenie tokenu ─────────────────────────────
async function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'] || req.query.token;
  if (!token) return res.status(401).json({ chyba: 'Nie si prihlásený.' });
  try {
    const r = await q(
      `SELECT a.id, a.username, a.meno FROM admin_session s
       JOIN admin a ON a.id = s.admin_id
       WHERE s.token = $1 AND s.expiruje > NOW() AND a.aktivny = TRUE`,
      [token]
    );
    if (!r.rows.length) return res.status(401).json({ chyba: 'Neplatná session. Prihlás sa znova.' });
    req.admin = r.rows[0];
    next();
  } catch(e) {
    res.status(500).json({ chyba: 'Chyba overenia.' });
  }
}

// ── SETUP – vytvorenie prvého admina (len ak žiadny neexistuje) ──
app.post('/api/admin/setup', async (req, res) => {
  try {
    const existing = await q(`SELECT COUNT(*) as cnt FROM admin`);
    if (parseInt(existing.rows[0].cnt) > 0)
      return res.status(403).json({ chyba: 'Admin už existuje.' });
    const { username, password, meno } = req.body;
    if (!username || !password) return res.status(400).json({ chyba: 'Chýba username/password.' });
    const hash = await bcrypt.hash(password, 10);
    await q(`INSERT INTO admin (username, password, meno) VALUES ($1, $2, $3)`,
      [username, hash, meno || 'Správca']);
    res.json({ uspech: true, sprava: 'Admin vytvorený. Môžeš sa prihlásiť.' });
  } catch(e) { res.status(500).json({ chyba: 'Chyba setupu.' }); }
});

// ── PRIHLÁSENIE ──────────────────────────────────────────────
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ chyba: 'Zadaj username a heslo.' });
  try {
    const r = await q(
      `SELECT id, username, password, meno FROM admin WHERE username=$1 AND aktivny=TRUE`,
      [username]
    );
    if (!r.rows.length)
      return res.status(401).json({ chyba: 'Nesprávne meno alebo heslo.' });

    const admin = r.rows[0];
    const ok = await bcrypt.compare(password, admin.password);
    if (!ok)
      return res.status(401).json({ chyba: 'Nesprávne meno alebo heslo.' });

    // Vygeneruj token
    const token = crypto.randomBytes(32).toString('hex');
    await q(
      `INSERT INTO admin_session (token, admin_id, ip_adresa, user_agent)
       VALUES ($1, $2, $3::inet, $4)`,
      [token, admin.id, req.ip, req.headers['user-agent'] || null]
    );
    await q(`UPDATE admin SET posledny_login=NOW() WHERE id=$1`, [admin.id]);

    res.json({ uspech: true, token, meno: admin.meno, username: admin.username });
  } catch(e) {
    console.error(e);
    res.status(500).json({ chyba: 'Chyba prihlásenia.' });
  }
});

// ── ODHLÁSENIE ───────────────────────────────────────────────
app.post('/api/admin/logout', async (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) await q(`DELETE FROM admin_session WHERE token=$1`, [token]).catch(()=>{});
  res.json({ uspech: true });
});

// ── ZMENA HESLA ──────────────────────────────────────────────
app.post('/api/admin/zmena-hesla', requireAdmin, async (req, res) => {
  const { stare_heslo, nove_heslo } = req.body;
  if (!stare_heslo || !nove_heslo || nove_heslo.length < 6)
    return res.status(400).json({ chyba: 'Heslo musí mať aspoň 6 znakov.' });
  try {
    const r = await q(`SELECT password FROM admin WHERE id=$1`, [req.admin.id]);
    const ok = await bcrypt.compare(stare_heslo, r.rows[0].password);
    if (!ok) return res.status(401).json({ chyba: 'Staré heslo je nesprávne.' });
    const hash = await bcrypt.hash(nove_heslo, 10);
    await q(`UPDATE admin SET password=$1 WHERE id=$2`, [hash, req.admin.id]);
    // Zmaž všetky ostatné sessiony
    await q(`DELETE FROM admin_session WHERE admin_id=$1 AND token!=$2`,
      [req.admin.id, req.headers['x-admin-token']]);
    res.json({ uspech: true, sprava: 'Heslo zmenené.' });
  } catch(e) { res.status(500).json({ chyba: 'Chyba.' }); }
});

// ════════════════════════════════════════════════════════════
//  ADMIN API  (chránené – requireAdmin middleware)
// ════════════════════════════════════════════════════════════

// ── Štatistiky ──────────────────────────────────────────────
app.get('/api/admin/statistiky', requireAdmin, async (req, res) => {
  try {
    const r = await q(`SELECT * FROM v_statistiky`);
    const obsadenost = await q(`
      SELECT
        COUNT(*) FILTER (WHERE volne = FALSE) AS obsadene_dni,
        COUNT(*) FILTER (WHERE volne = TRUE)  AS volne_dni,
        COUNT(*)                               AS celkom_dni
      FROM dostupnost_90dni`);
    res.json({ ...r.rows[0], ...obsadenost.rows[0] });
  } catch (e) { res.status(500).json({ chyba: 'Chyba štatistík.' }); }
});

// ── Všetky rezervácie ───────────────────────────────────────
app.get('/api/admin/rezervacie', requireAdmin, async (req, res) => {
  try {
    const r = await q(`
      SELECT * FROM v_rezervacie
      WHERE status != 'zrusena'
      ORDER BY datum_od ASC`);
    res.json({ rezervacie: r.rows });
  } catch (e) { res.status(500).json({ chyba: 'Chyba rezervácií.' }); }
});

// ── Zmena statusu rezervácie ────────────────────────────────
app.patch('/api/admin/rezervacie/:id', requireAdmin, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['cakajuca','potvrdena','zaplatena','zrusena','dokoncena'];
  if (!validStatuses.includes(status))
    return res.status(400).json({ chyba: 'Neplatný status.' });
  try {
    await q(`UPDATE rezervacia SET status=$1, aktualizovana=NOW() WHERE id=$2`,
      [status, req.params.id]);
    res.json({ uspech: true });
  } catch (e) { res.status(500).json({ chyba: 'Chyba aktualizácie.' }); }
});

// ── Neschválené recenzie ─────────────────────────────────────
app.get('/api/admin/recenzie-cakajuce', requireAdmin, async (req, res) => {
  try {
    const r = await q(`SELECT * FROM recenzia WHERE schvalena=FALSE ORDER BY vytvorena DESC`);
    res.json({ recenzie: r.rows });
  } catch (e) { res.status(500).json({ chyba: 'Chyba.' }); }
});

// ── Schválenie recenzie ──────────────────────────────────────
app.patch('/api/admin/recenzie/:id', requireAdmin, async (req, res) => {
  const { schvalena } = req.body;
  try {
    await q(`UPDATE recenzia SET schvalena=$1 WHERE id=$2`, [schvalena, req.params.id]);
    res.json({ uspech: true });
  } catch (e) { res.status(500).json({ chyba: 'Chyba.' }); }
});

// ── Správy ───────────────────────────────────────────────────
app.get('/api/admin/spravy', requireAdmin, async (req, res) => {
  try {
    const r = await q(`SELECT * FROM sprava ORDER BY vytvorena DESC LIMIT 50`);
    res.json({ spravy: r.rows });
  } catch (e) { res.status(500).json({ chyba: 'Chyba.' }); }
});

// ── Blokovanie termínov ──────────────────────────────────────
app.post('/api/admin/blokovat', requireAdmin, async (req, res) => {
  const { datum_od, datum_do, dovod } = req.body;
  if (!datum_od || !datum_do) return res.status(400).json({ chyba: 'Chýba dátum.' });
  try {
    await q(`INSERT INTO blokovane_terminy (datum_od,datum_do,dovod) VALUES ($1,$2,$3)`,
      [datum_od, datum_do, dovod||null]);
    res.status(201).json({ uspech: true });
  } catch (e) { res.status(500).json({ chyba: 'Chyba blokovania.' }); }
});

app.get('/api/admin/bloky', requireAdmin, async (req, res) => {
  try {
    const r = await q(`SELECT * FROM blokovane_terminy ORDER BY datum_od`);
    res.json({ bloky: r.rows });
  } catch (e) { res.status(500).json({ chyba: 'Chyba.' }); }
});

app.delete('/api/admin/bloky/:id', requireAdmin, async (req, res) => {
  try {
    await q(`DELETE FROM blokovane_terminy WHERE id=$1`, [req.params.id]);
    res.json({ uspech: true });
  } catch (e) { res.status(500).json({ chyba: 'Chyba.' }); }
});

// ── Fallback ────────────────────────────────────────────────
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chata-lechnica.html'));
});

app.listen(PORT, () => console.log(`🏠 Server beží na http://localhost:${PORT}`));