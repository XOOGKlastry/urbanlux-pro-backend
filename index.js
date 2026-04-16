require('dotenv').config()
const express = require('express')
const cors = require('cors')
const { Pool } = require('pg')
const admin = require('firebase-admin')

// ── FIREBASE ADMIN ─────────────────────────────────────
// ── FIREBASE ADMIN ─────────────────────────────────────
let firebaseReady = false
try {
	// Parsowanie klucza ze zmiennej środowiskowej (Base64) ustawionej na serwerze Render
	const serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '', 'base64').toString())
	admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
	firebaseReady = true
	console.log('✅ Firebase Admin zainicjalizowany (z Base64)')
} catch (e) {
	console.warn(
		'⚠️  Błąd inicjalizacji Firebase (brak zmiennej środowiskowej) — endpointy auth nie zadziałają',
		e.message,
	)
}

// ── MIDDLEWARE AUTH ─────────────────────────────────────
async function verifyToken(req, res, next) {
	if (!firebaseReady) return res.status(503).json({ error: 'Auth niedostępny — brak serviceAccountKey.json' })
	const auth = req.headers.authorization
	if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Brak tokenu' })
	try {
		req.user = await admin.auth().verifyIdToken(auth.slice(7))
		next()
	} catch {
		res.status(403).json({ error: 'Nieprawidłowy token' })
	}
}

// ── EXPRESS & DB ────────────────────────────────────────
const app = express()
const PORT = process.env.PORT || 3000

const allowedOrigins = [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://127.0.0.1:5500'].filter(Boolean)

app.use(
	cors({
		origin: (origin, cb) => {
			if (!origin || allowedOrigins.some(o => origin.startsWith(o))) cb(null, true)
			else cb(new Error(`CORS blocked: ${origin}`))
		},
		methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
		allowedHeaders: ['Content-Type', 'Authorization'],
	}),
)
app.use(express.json({ limit: '5mb' }))

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Walidacja nazw kolumn (ochrona przed SQL injection w bulk edit)
const ALLOWED_LAMP_COLS = new Set([
	'lat',
	'lng',
	'nr_slupa',
	'rodzaj_slupa',
	'liczba_opraw',
	'kat_wysiegnika',
	'dlugosc_wysiegnika',
	'rodzaj_oprawy',
	'model_oprawy',
	'stan_slupa',
	'stan_oprawy',
	'wysokosc_slupa',
	'szafa_oswietleniowa',
	'rodzaj_linii',
	'miejscowosc',
	'ulica',
	'notes',
	'usterka',
	'usterka_typ',
	'usterka_opis',
	'moc_oprawa_w',
	'odleglosc_od_krawedzi',
	'segment_id',
	'photo',
])

// ── HEALTH ─────────────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ status: 'ok', ts: new Date().toISOString() }))

// ════════════════════════════════════════════════════════
// LAMPY
// ════════════════════════════════════════════════════════

app.get('/api/lamps', async (req, res) => {
	try {
		const result = await pool.query('SELECT * FROM lamps WHERE _deleted IS NOT TRUE ORDER BY id')
		res.json(result.rows)
	} catch (err) {
		console.error('[GET /api/lamps]', err.message)
		res.status(500).json({ error: err.message })
	}
})

app.post('/api/lamps', verifyToken, async (req, res) => {
	const d = req.body
	try {
		await pool.query(
			`
      INSERT INTO lamps (
        id, lat, lng, nr_slupa, rodzaj_slupa, liczba_opraw, kat_wysiegnika,
        dlugosc_wysiegnika, rodzaj_oprawy, model_oprawy, stan_slupa, stan_oprawy,
        wysokosc_slupa, moc_oprawa_w, odleglosc_od_krawedzi,
        szafa_oswietleniowa, rodzaj_linii, miejscowosc, ulica, notes,
        usterka, usterka_typ, usterka_opis, photo, segment_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25
      )`,
			[
				d.id,
				d.lat,
				d.lng,
				d.nr_slupa,
				d.rodzaj_slupa,
				d.liczba_opraw,
				d.kat_wysiegnika,
				d.dlugosc_wysiegnika,
				d.rodzaj_oprawy,
				d.model_oprawy,
				d.stan_slupa,
				d.stan_oprawy,
				d.wysokosc_slupa,
				d.moc_oprawa_w || null,
				d.odleglosc_od_krawedzi || null,
				d.szafa_oswietleniowa,
				d.rodzaj_linii,
				d.miejscowosc,
				d.ulica,
				d.notes,
				d.usterka || 'NIE',
				d.usterka_typ || '',
				d.usterka_opis || '',
				d.photo || null,
				d.segment_id || null,
			],
		)
		res.status(201).json({ message: 'Dodano', id: d.id })
	} catch (err) {
		console.error('[POST /api/lamps]', err.message)
		res.status(500).json({ error: err.message })
	}
})

app.put('/api/lamps/:id', verifyToken, async (req, res) => {
	const id = req.params.id
	const d = req.body
	try {
		await pool.query(
			`
      INSERT INTO lamps (
        id, lat, lng, nr_slupa, rodzaj_slupa, liczba_opraw, kat_wysiegnika,
        dlugosc_wysiegnika, rodzaj_oprawy, model_oprawy, stan_slupa, stan_oprawy,
        wysokosc_slupa, moc_oprawa_w, odleglosc_od_krawedzi,
        szafa_oswietleniowa, rodzaj_linii, miejscowosc, ulica, notes,
        usterka, usterka_typ, usterka_opis
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23
      ) ON CONFLICT (id) DO UPDATE SET
        lat=$2, lng=$3, nr_slupa=$4, rodzaj_slupa=$5, liczba_opraw=$6,
        kat_wysiegnika=$7, dlugosc_wysiegnika=$8, rodzaj_oprawy=$9, model_oprawy=$10,
        stan_slupa=$11, stan_oprawy=$12, wysokosc_slupa=$13, moc_oprawa_w=$14,
        odleglosc_od_krawedzi=$15, szafa_oswietleniowa=$16, rodzaj_linii=$17,
        miejscowosc=$18, ulica=$19, notes=$20,
        usterka=$21, usterka_typ=$22, usterka_opis=$23`,
			[
				id,
				d.lat,
				d.lng,
				d.nr_slupa,
				d.rodzaj_slupa,
				d.liczba_opraw,
				d.kat_wysiegnika,
				d.dlugosc_wysiegnika,
				d.rodzaj_oprawy,
				d.model_oprawy,
				d.stan_slupa,
				d.stan_oprawy,
				d.wysokosc_slupa,
				d.moc_oprawa_w || null,
				d.odleglosc_od_krawedzi || null,
				d.szafa_oswietleniowa,
				d.rodzaj_linii,
				d.miejscowosc,
				d.ulica,
				d.notes,
				d.usterka || 'NIE',
				d.usterka_typ || '',
				d.usterka_opis || '',
			],
		)
		res.json({ message: 'Zaktualizowano' })
	} catch (err) {
		console.error(`[PUT /api/lamps/${id}]`, err.message)
		res.status(500).json({ error: err.message })
	}
})

app.delete('/api/lamps/:id', verifyToken, async (req, res) => {
	try {
		await pool.query(
			'INSERT INTO lamps (id, _deleted) VALUES ($1, true) ON CONFLICT (id) DO UPDATE SET _deleted = true',
			[req.params.id],
		)
		res.json({ message: 'Usunięto (soft delete)' })
	} catch (err) {
		console.error(`[DELETE /api/lamps/${req.params.id}]`, err.message)
		res.status(500).json({ error: err.message })
	}
})

// Bulk edit
app.put('/api/lamps-bulk', verifyToken, async (req, res) => {
	const { ids, changes } = req.body
	try {
		const keys = Object.keys(changes).filter(k => ALLOWED_LAMP_COLS.has(k))
		if (!keys.length) return res.json({ message: 'Brak dozwolonych zmian' })
		const setClause = keys.map((k, i) => `${k} = $${i + 2}`).join(', ')
		for (const id of ids) {
			await pool.query(`UPDATE lamps SET ${setClause} WHERE id = $1`, [id, ...keys.map(k => changes[k])])
		}
		res.json({ message: `Zaktualizowano ${ids.length} lamp` })
	} catch (err) {
		console.error('[PUT /api/lamps-bulk]', err.message)
		res.status(500).json({ error: err.message })
	}
})

// Przypisz lampę do segmentu
app.patch('/api/lamps/:id/segment', verifyToken, async (req, res) => {
	try {
		await pool.query('UPDATE lamps SET segment_id=$2 WHERE id=$1', [req.params.id, req.body.segment_id || null])
		res.json({ ok: true })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// ════════════════════════════════════════════════════════
// SEGMENTY DROGOWE
// ════════════════════════════════════════════════════════

app.get('/api/segments', async (req, res) => {
	try {
		const r = await pool.query('SELECT * FROM road_segments ORDER BY created_at DESC')
		res.json(r.rows)
	} catch (err) {
		console.error('[GET /api/segments]', err.message)
		res.status(500).json({ error: err.message })
	}
})

app.post('/api/segments', verifyToken, async (req, res) => {
	const d = req.body
	try {
		const r = await pool.query(
			`
      INSERT INTO road_segments (
        nazwa, geojson, dlugosc_m, klasa_oswietleniowa, nawierzchnia,
        szerokosc_jezdni_m, liczba_pasow, predkosc_max_kmh, natezenie_ruchu,
        control_box_id, miejscowosc, ulica, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING id`,
			[
				d.nazwa,
				JSON.stringify(d.geojson),
				d.dlugosc_m,
				d.klasa_oswietleniowa,
				d.nawierzchnia,
				d.szerokosc_jezdni_m,
				d.liczba_pasow || 2,
				d.predkosc_max_kmh || 50,
				d.natezenie_ruchu,
				d.control_box_id || null,
				d.miejscowosc,
				d.ulica,
				d.notes,
			],
		)
		res.status(201).json({ id: r.rows[0].id })
	} catch (err) {
		console.error('[POST /api/segments]', err.message)
		res.status(500).json({ error: err.message })
	}
})

app.put('/api/segments/:id', verifyToken, async (req, res) => {
	const d = req.body
	try {
		await pool.query(
			`
      UPDATE road_segments SET
        nazwa=$2, geojson=$3, dlugosc_m=$4, klasa_oswietleniowa=$5,
        nawierzchnia=$6, szerokosc_jezdni_m=$7, liczba_pasow=$8,
        predkosc_max_kmh=$9, natezenie_ruchu=$10, ulica=$11, notes=$12,
        updated_at=NOW()
      WHERE id=$1`,
			[
				req.params.id,
				d.nazwa,
				JSON.stringify(d.geojson),
				d.dlugosc_m,
				d.klasa_oswietleniowa,
				d.nawierzchnia,
				d.szerokosc_jezdni_m,
				d.liczba_pasow,
				d.predkosc_max_kmh,
				d.natezenie_ruchu,
				d.ulica,
				d.notes,
			],
		)
		res.json({ ok: true })
	} catch (err) {
		console.error(`[PUT /api/segments/${req.params.id}]`, err.message)
		res.status(500).json({ error: err.message })
	}
})

app.delete('/api/segments/:id', verifyToken, async (req, res) => {
	try {
		await pool.query('DELETE FROM road_segments WHERE id=$1', [req.params.id])
		res.json({ ok: true })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// ════════════════════════════════════════════════════════
// SZAFKI SON
// ════════════════════════════════════════════════════════

app.get('/api/boxes', async (req, res) => {
	try {
		const r = await pool.query('SELECT * FROM control_boxes ORDER BY numer')
		res.json(r.rows)
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

app.post('/api/boxes', verifyToken, async (req, res) => {
	const d = req.body
	try {
		const r = await pool.query(
			`
      INSERT INTO control_boxes (numer, lat, lng, miejscowosc, ulica, moc_przylacza, taryfa, licznik_nr, stan, notes)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      RETURNING id`,
			[
				d.numer,
				d.lat,
				d.lng,
				d.miejscowosc,
				d.ulica,
				d.moc_przylacza || null,
				d.taryfa,
				d.licznik_nr,
				d.stan || 'dobry',
				d.notes,
			],
		)
		res.status(201).json({ id: r.rows[0].id })
	} catch (err) {
		console.error('[POST /api/boxes]', err.message)
		res.status(500).json({ error: err.message })
	}
})

app.put('/api/boxes/:id', verifyToken, async (req, res) => {
	const d = req.body
	try {
		await pool.query(
			`
      UPDATE control_boxes SET
        numer=$2, miejscowosc=$3, ulica=$4, moc_przylacza=$5,
        taryfa=$6, licznik_nr=$7, stan=$8, notes=$9
      WHERE id=$1`,
			[
				req.params.id,
				d.numer,
				d.miejscowosc,
				d.ulica,
				d.moc_przylacza || null,
				d.taryfa,
				d.licznik_nr,
				d.stan,
				d.notes,
			],
		)
		res.json({ ok: true })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

app.delete('/api/boxes/:id', verifyToken, async (req, res) => {
	try {
		await pool.query('DELETE FROM control_boxes WHERE id=$1', [req.params.id])
		res.json({ ok: true })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// ════════════════════════════════════════════════════════
// AUDYTY ENERGETYCZNE
// ════════════════════════════════════════════════════════

app.get('/api/audits', verifyToken, async (req, res) => {
	try {
		const r = await pool.query('SELECT * FROM energy_audits ORDER BY created_at DESC')
		res.json(r.rows)
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

app.post('/api/audits', verifyToken, async (req, res) => {
	const d = req.body
	try {
		const r = await pool.query(
			`
      INSERT INTO energy_audits (nazwa, miejscowosc, data_audytu, autor, cena_kwh, taryfa, godziny_pracy_rok)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
			[
				d.nazwa,
				d.miejscowosc,
				d.data_audytu || new Date().toISOString().slice(0, 10),
				d.autor,
				d.cena_kwh || 0.75,
				d.taryfa || 'C11',
				d.godziny_pracy_rok || 4000,
			],
		)
		res.status(201).json({ id: r.rows[0].id })
	} catch (err) {
		console.error('[POST /api/audits]', err.message)
		res.status(500).json({ error: err.message })
	}
})

app.put('/api/audits/:id/results', verifyToken, async (req, res) => {
	const d = req.body
	try {
		await pool.query(
			`
      UPDATE energy_audits SET
        moc_istniejaca_kw=$2, moc_opcja1_kw=$3, moc_opcja2_kw=$4, moc_opcja3_kw=$5,
        koszt_energii_rok_istniejacy=$6,
        oszczednosc_opcja1_pln_rok=$7, oszczednosc_opcja2_pln_rok=$8, oszczednosc_opcja3_pln_rok=$9,
        emisja_co2_istniejaca_kg_rok=$10,
        koszt_inwestycji_opcja1=$11, koszt_inwestycji_opcja2=$12, koszt_inwestycji_opcja3=$13,
        wyniki_json=$14
      WHERE id=$1`,
			[
				req.params.id,
				d.moc_istniejaca_kw,
				d.moc_opcja1_kw,
				d.moc_opcja2_kw,
				d.moc_opcja3_kw,
				d.koszt_energii_rok_istniejacy,
				d.oszczednosc_opcja1_pln_rok,
				d.oszczednosc_opcja2_pln_rok,
				d.oszczednosc_opcja3_pln_rok,
				d.emisja_co2_istniejaca_kg_rok,
				d.koszt_inwestycji_opcja1,
				d.koszt_inwestycji_opcja2,
				d.koszt_inwestycji_opcja3,
				JSON.stringify(d.wyniki_json || {}),
			],
		)
		res.json({ ok: true })
	} catch (err) {
		res.status(500).json({ error: err.message })
	}
})

// ════════════════════════════════════════════════════════
// STREET VIEW PROXY
// ════════════════════════════════════════════════════════

app.get('/api/streetview/metadata', async (req, res) => {
	const { lat, lng } = req.query
	const key = process.env.GOOGLE_MAPS_KEY
	if (!key) return res.json({ status: 'NO_KEY' })
	try {
		const url = `https://maps.googleapis.com/maps/api/streetview/metadata?location=${lat},${lng}&key=${key}`
		const response = await fetch(url)
		const data = await response.json()
		res.json(data)
	} catch {
		res.json({ status: 'ERROR' })
	}
})

// ── START ─────────────────────────────────────────────
app.listen(PORT, () => {
	console.log(`🚀 UrbanLux Pro backend działa na http://localhost:${PORT}`)
})
