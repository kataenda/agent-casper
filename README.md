# Agent Casper AI — Autonomous DeFi Yield Agent on Casper Network

> **Casper Agentic AI Buildathon 2026** · Build Direction #1: Autonomous Yield-Routing Agent via MCP

[![Casper Testnet](https://img.shields.io/badge/Casper-Testnet-00F5FF)](https://testnet.cspr.live)
[![Smart Contract](https://img.shields.io/badge/Contract-hash--f6ba9dfa-00FF94)](https://testnet.cspr.live)
[![License: MIT](https://img.shields.io/badge/License-MIT-BF5AF2.svg)](LICENSE)
[![Demo Video](https://img.shields.io/badge/Demo-YouTube-FF0000)](https://youtu.be/cYOoYzr03gI)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-Vercel-000000)](https://agent-casper-git-master-soeclaw.vercel.app)

---

## Tautan Penting

| | |
|---|---|
| **Live Dashboard** | https://agent-casper-git-master-soeclaw.vercel.app |
| **Demo Video** | https://youtu.be/cYOoYzr03gI |
| **Smart Contract** | https://testnet.cspr.live (hash-f6ba9dfa...) |
| **Backend API** | Deploy ke Railway (lihat panduan di bawah) |

---

## Gambaran Umum

**AGENT-CASPER** adalah agen DeFi otonom yang berjalan di Casper Network. Setiap 60 detik, agen ini:
1. Mengambil harga aset dunia nyata (PAXG/emas, UST10Y/obligasi AS, WTI/minyak)
2. Mengambil data yield rates dari validator Casper via CSPR.cloud
3. Mengirim semua data ke Claude AI untuk dianalisis
4. Mengeksekusi transaksi on-chain secara otomatis jika perlu rebalancing

> Built using the [Casper AI Toolkit](https://www.casper.network/ai) — MCP Servers, CSPR.cloud, Odra Framework, casper-js-sdk v5

---

## Arsitektur

```
┌─────────────────────────────────────────────────────────────────┐
│                        AGENT-CASPER                             │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐  │
│  │  RWA     │    │  Claude AI   │    │   YieldVault         │  │
│  │  Oracle  ├───▶│  Decision    ├───▶│   Smart Contract     │  │
│  │ PAXG/    │    │  Engine      │    │   (Odra 2.x / Casper │  │
│  │ UST10Y/  │    │  (MCP Tools) │    │   Testnet)           │  │
│  │ WTI Oil  │    └──────────────┘    └──────────────────────┘  │
│  └──────────┘                                                   │
│       │              ▲                        │                 │
│  ┌────▼──────────────┴────────────────────────▼──────────────┐  │
│  │          FastAPI Backend (Python)                         │  │
│  │  • Yield Agent loop (every 60s)                           │  │
│  │  • CSPR.cloud middleware                                  │  │
│  │  • X402 micropayment handler                              │  │
│  │  • WebSocket broadcast                                    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                            │                                    │
│  ┌─────────────────────────▼──────────────────────────────────┐  │
│  │         Next.js Dashboard (React + TypeScript)             │  │
│  │  • Real-time cyber dashboard                               │  │
│  │  • Casper Wallet integration                               │  │
│  │  • Deploy / Register Agent / Deposit buttons               │  │
│  │  • AI chat interface                                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Casper AI Toolkit yang Digunakan

| Tool | Kegunaan |
|------|-------|
| **CSPR.cloud** | Data block, deploy status, saldo akun |
| **Odra Framework 2.7.2** | Smart contract YieldVault (Rust → WASM) |
| **casper-js-sdk v5** | Frontend deploy signing, integrasi wallet |
| **X402 Protocol** | Handler micropayment (dinonaktifkan by default, aktifkan via `X402_ENABLED=true`) |
| **MCP Server** | Mengekspos state blockchain ke Claude via tool calls |
| **Casper Wallet** | Autentikasi user dan penandatanganan transaksi |
| **Claude AI** | Keputusan rebalancing otonom dengan konteks RWA |

---

## Smart Contract — YieldVault

**Deploy di Casper Testnet:**
```
Contract Hash: hash-f6ba9dfa2a236dcc253436c3350f06931465ca94290fad689dfc7c9058c559da
Network:       casper-test
Framework:     Odra 2.7.2 (Rust → WASM)
```

### Entry Points

| Fungsi | Keterangan |
|----------|-------------|
| `deposit()` | Payable — user deposit CSPR ke vault |
| `withdraw(amount)` | User withdraw saldo CSPR |
| `register_agent(agent)` | Owner daftarkan alamat AI agent |
| `rebalance(strategy, pcts, reason)` | Agent eksekusi portfolio rebalance |
| `update_rwa_price(asset, price, yield)` | Agent posting data RWA ke on-chain |
| `get_portfolio()` | Mengembalikan TVL dan alokasi saat ini |
| `emergency_pause()` | Kontrol keamanan oleh owner |

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Smart Contract | Rust + Odra 2.7.2 → WASM (Casper 2.x) |
| Backend | Python 3.11 + FastAPI + httpx |
| AI | Anthropic Claude (claude-haiku-4-5) |
| Frontend | Next.js 14 + React 18 + TypeScript |
| UI | Tailwind CSS + Recharts + Lucide |
| Wallet | Casper Wallet Extension + casper-js-sdk v5 |
| CI/CD | GitHub Actions (auto-build WASM on push) |

---

## Referensi Semua Environment Variable

File `.env` (salin dari `backend/.env.example`):

```env
# ── AI ──────────────────────────────────────────────────────────────────────
# Daftar di https://console.anthropic.com → API Keys
ANTHROPIC_API_KEY=sk-ant-api03-...

# ── Casper Network ────────────────────────────────────────────────────────
# Gunakan endpoint resmi CSPR.cloud (https://www.casper.network/ai)
CASPER_NODE_URL=https://node.testnet.cspr.cloud/rpc
CSPR_CLOUD_API_KEY=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx   # Daftar di cspr.cloud
CSPR_CLOUD_BASE_URL=https://api.testnet.cspr.cloud

# ── Vault & Agent ─────────────────────────────────────────────────────────
# Diisi setelah deploy contract via dashboard
VAULT_CONTRACT_HASH=hash-xxxx...
VAULT_CONTRACT_VERSION_HASH=xxxx...
AGENT_ACCOUNT_HASH=account-hash-xxxx...
AGENT_SECRET_KEY_PATH=./agent_secret_key.pem

# Untuk Railway / cloud deploy: isi konten PEM langsung di sini (ganti newline dengan \n)
# AGENT_SECRET_KEY_CONTENT=-----BEGIN PRIVATE KEY-----\nxxxx\n-----END PRIVATE KEY-----

# ── Agent Configuration ───────────────────────────────────────────────────
AGENT_POLL_INTERVAL_SECONDS=60   # Interval polling (detik)
MAX_REBALANCES_PER_DAY=5         # Maksimal rebalance per hari

# ── X402 Micropayment (opsional) ──────────────────────────────────────────
X402_ENABLED=false
X402_PAYMENT_AMOUNT=1000000
X402_FACILITATOR_URL=https://x402-facilitator.cspr.cloud

# ── App ───────────────────────────────────────────────────────────────────
APP_HOST=0.0.0.0
APP_PORT=8000
DEBUG=false
```

---

## Panduan Setup Lokal (Development)

### Prasyarat

- Python 3.11+
- Node.js 18+
- [Casper Wallet](https://www.casperwallet.io/) browser extension
- Testnet CSPR dari [faucet](https://testnet.cspr.live/tools/faucet)
- API Key Anthropic dari [console.anthropic.com](https://console.anthropic.com)
- API Key CSPR.cloud dari [cspr.cloud](https://cspr.cloud)

### 1. Clone Repository

```bash
git clone https://github.com/kataenda/agent-casper.git
cd agent-casper
```

### 2. Setup Backend

```bash
# Buat virtual environment
python -m venv .venv

# Aktifkan venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac

# Install dependencies
pip install -r backend/requirements.txt
```

Buat file `.env`:
```bash
cp backend/.env.example backend/.env
# Edit backend/.env, isi semua variabel yang dibutuhkan
```

Jalankan backend:
```bash
python -m uvicorn main:app --app-dir backend --host 0.0.0.0 --port 8000 --reload
```

Backend tersedia di: `http://localhost:8000`
Swagger API docs: `http://localhost:8000/docs`

### 3. Setup Frontend

```bash
cd frontend
npm install
```

Buat file `.env.local`:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000
```

Jalankan frontend:
```bash
npm run dev
```

Dashboard tersedia di: `http://localhost:3000`

---

## Panduan Deploy ke Railway (Backend)

Railway digunakan untuk menjalankan backend Python secara terus-menerus (24/7).

### Langkah 1 — Buat Project di Railway

1. Buka [railway.com](https://railway.com) → **New Project**
2. Pilih **Deploy from GitHub repo**
3. Pilih repository `agent-casper`
4. Railway akan otomatis mendeteksi Python app

### Langkah 2 — Konfigurasi Root Directory

Di Railway Settings → **Source**:
- **Root Directory**: `backend`
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `uvicorn main:app --host 0.0.0.0 --port $PORT`

### Langkah 3 — Set Environment Variables di Railway

Di Railway → project → **Variables**, tambahkan semua variabel berikut:

| Variable | Nilai |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` (dari console.anthropic.com) |
| `CASPER_NODE_URL` | `https://node.testnet.cspr.cloud/rpc` |
| `CSPR_CLOUD_API_KEY` | API key dari cspr.cloud |
| `CSPR_CLOUD_BASE_URL` | `https://api.testnet.cspr.cloud` |
| `VAULT_CONTRACT_HASH` | hash contract (setelah deploy) |
| `VAULT_CONTRACT_VERSION_HASH` | version hash contract |
| `AGENT_ACCOUNT_HASH` | `account-hash-xxxx...` |
| `AGENT_SECRET_KEY_CONTENT` | Isi file `.pem` (ganti newline jadi `\n`) |
| `MAX_REBALANCES_PER_DAY` | `5` |
| `AGENT_POLL_INTERVAL_SECONDS` | `60` |
| `DEBUG` | `false` |

> **Tips `AGENT_SECRET_KEY_CONTENT`:** Salin seluruh isi file `agent_secret_key.pem`, lalu ganti setiap baris baru dengan karakter `\n` sebelum paste ke Railway.
>
> Contoh di PowerShell:
> ```powershell
> (Get-Content agent_secret_key.pem -Raw) -replace "`r`n","\n" -replace "`n","\n"
> ```

### Langkah 4 — Deploy

Railway akan otomatis build dan deploy setiap kali ada push ke branch `master`.

Cek log Railway untuk memastikan berhasil:
```
INFO     agent.yield_agent — YieldAgent started — polling every 60s
INFO     agent.yield_agent — [Block 8,xxx,xxx] Decision: HOLD | Confidence: 0.88
```

### Langkah 5 — Hubungkan Frontend ke Railway Backend

Di Vercel → project `agent-casper` → **Settings → Environment Variables**:

| Variable | Nilai |
|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | URL Railway kamu, misal `https://agent-casper-production.up.railway.app` |
| `ANTHROPIC_API_KEY` | `sk-ant-api03-...` (untuk fitur AI chat di Vercel) |

Redeploy frontend di Vercel setelah menambahkan variabel.

---

## Panduan Penggunaan Dashboard

### Panel-Panel di Dashboard

```
┌──────────────────┬──────────────────┬──────────────────┬──────────────────┐
│  PORTFOLIO VALUE │   REBALANCES     │   AI DECISION    │  BLOCK HEIGHT    │
│  1,332 CSPR      │   0              │   HOLD           │  #8,102,213      │
│  Strategy: Bal.  │   0 cycles       │   Confidence:82% │  Casper Testnet  │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┘
┌────────────────┬────────────────────────┬────────────────┬────────────────┐
│  RWA ORACLE    │  PORTFOLIO TRAJECTORY  │  ON-CHAIN PROOF│ YIELD INTELL.  │
│  PAXG (Gold)   │  Grafik portfolio      │  Contract Live │ Conservative:  │
│  UST10Y (Bond) │  nilai dari waktu      │  Hash deploy   │  9.53% APY     │
│  WTI (Oil)     │  ke waktu              │  TX terakhir   │ Aggressive:    │
├────────────────┤                        │                │  14.50% APY    │
│  ALLOC MATRIX  │                        │                │                │
│  Donut chart   │                        │                │                │
└────────────────┴────────────────────────┴────────────────┴────────────────┘
┌────────────────┬────────────────────────────────────────┬────────────────┐
│  VAULT ACTIONS │  NEURAL DECISION LOG                   │  ASK AI AGENT  │
│  Deposit CSPR  │  Histori semua keputusan AI            │  Chat dengan   │
│  TX History    │  HOLD / REBALANCE + reasoning          │  Claude AI     │
└────────────────┴────────────────────────────────────────┴────────────────┘
```

### Alur Penggunaan Pertama Kali

#### Langkah 1 — Siapkan Wallet

1. Install [Casper Wallet](https://www.casperwallet.io/) di browser
2. Buat atau import akun Casper
3. Dapatkan testnet CSPR dari [faucet](https://testnet.cspr.live/tools/faucet) (butuh minimal ~250 CSPR)

#### Langkah 2 — Buka Dashboard

Buka: `https://agent-casper-git-master-soeclaw.vercel.app`

Klik tombol **wallet** di pojok kanan atas → **Connect Casper Wallet**

#### Langkah 3 — Deploy Smart Contract

> Lewati langkah ini jika contract sudah deploy (hash sudah ada di `.env`)

1. Klik tombol **"Deploy Contract"** di panel Vault Actions
2. Casper Wallet akan minta konfirmasi transaksi (~230 CSPR gas)
3. Tunggu konfirmasi (~2 menit), Contract Hash akan muncul di On-Chain Proof panel

#### Langkah 4 — Register Agent

1. Klik **"Register Agent"**
2. Konfirmasi di Casper Wallet
3. Tunggu sampai status berubah jadi `AGENT REGISTERED` di panel On-Chain Proof

Ini memberi izin ke AI agent untuk mengeksekusi rebalance atas nama vault.

#### Langkah 5 — Deposit CSPR

1. Di panel **Vault Actions**, masukkan jumlah CSPR
2. Klik **"Deposit to Vault"**
3. Konfirmasi di Casper Wallet
4. TVL (Total Value Locked) akan terupdate di Portfolio Value

#### Langkah 6 — Pantau Agen Berjalan

Setelah deposit, agen sudah aktif otomatis. Pantau:

- **AI Decision** (pojok kanan atas kartu): HOLD / REBALANCE / ALERT
- **Neural Decision Log**: lihat reasoning Claude AI tiap 60 detik
- **Portfolio Trajectory**: grafik nilai portfolio dari waktu ke waktu
- **Allocation Matrix**: donut chart alokasi CONS/BALA/AGGR saat ini

---

## Tombol Kontrol Agent

| Tombol | Fungsi |
|--------|--------|
| **START AGENT** | Mulai loop agen (polling setiap 60 detik) |
| **STOP AGENT** | Hentikan loop agen sementara |
| **API** | Buka Swagger UI dokumentasi API backend |

---

## Perintah Chat (Ask AI Agent)

Ketik langsung di kotak **"Ask about portfolio..."** di pojok kanan bawah:

| Perintah | Contoh | Efek |
|---------|---------|--------|
| **start** | `start`, `resume`, `running` | Mulai agen loop |
| **stop** | `pause`, `stop` | Hentikan agen loop |
| **status** | `status`, `report` | Tampilkan status lengkap agen |
| **rebalance** | `rebalance`, `rebalance conservative` | Paksa rebalance sekarang |
| **Pertanyaan bebas** | `apa itu TVL?`, `strategi terbaik?` | Dijawab Claude AI |

**Contoh output `status`:**
```
STATUS AGENT:
• Running: Yes
• Rebalances today: 2/5
• Total cycles: 24
• Block: #8,102,213
• TVL: 1,332.00 CSPR
• Allocation: CON=40% BAL=45% AGG=15%
• Strategy: Balanced
• Last decision: HOLD (88% confidence)
```

**Contoh output `rebalance conservative`:**
```
REBALANCE EXECUTED!
• Strategy: Conservative (CON=70% BAL=20% AGG=10%)
• TX Hash: 7563c5813420aa0a...
• View: https://testnet.cspr.live/deploy/7563c581...
```

---

## Memahami Keputusan AI

### Tiga Jenis Keputusan

| Keputusan | Arti | Kapan terjadi |
|-----------|------|---------------|
| **HOLD** | Pertahankan alokasi saat ini | Portofolio sudah optimal, quota habis, atau kondisi pasar stabil |
| **REBALANCE** | Ubah alokasi portofolio | AI menemukan komposisi yang lebih baik secara risk-adjusted |
| **ALERT** | Kondisi anomali terdeteksi | APY spike >50%, TVL drop >30%, atau lonjakan risiko |

### Tiga Strategi Alokasi

| Strategi | CONS | BALA | AGGR | Risk | Cocok untuk |
|----------|------|------|------|------|-------------|
| **Conservative** | 70% | 20% | 10% | Rendah | Pasar tidak pasti, emas naik |
| **Balanced** | 40% | 45% | 15% | Sedang | Kondisi normal |
| **Aggressive** | 10% | 20% | 70% | Tinggi | Yield DeFi sangat tinggi |

### Indikator RWA yang Mempengaruhi Keputusan

| Sinyal | Dampak ke AI |
|--------|-------------|
| PAXG (emas) naik >1% | Favoritkan alokasi Conservative (flight-to-safety) |
| UST10Y (Treasury) >5% | Minta yield premium DeFi ≥3× Treasury rate |
| UST10Y <3.5% | DeFi lebih menarik → Balanced/Aggressive acceptable |
| WTI (minyak) naik tajam | Naikkan threshold risiko untuk posisi Aggressive |

---

## Struktur Proyek

```
agent-casper/
├── contracts/
│   ├── src/yield_vault.rs      # YieldVault Odra contract (Rust)
│   ├── Cargo.toml              # Odra 2.7.2 dependencies
│   ├── Dockerfile.build        # WASM compilation
│   └── wasm/yield_vault.wasm   # Built by CI
├── backend/
│   ├── main.py                 # FastAPI + WebSocket + lifecycle agen
│   ├── .env.example            # Template konfigurasi
│   ├── agent/
│   │   ├── yield_agent.py      # Loop agen otonom 60 detik
│   │   └── decision_engine.py  # Claude AI dengan MCP tools
│   └── casper/
│       ├── client.py           # CSPR.cloud REST client
│       ├── deployer.py         # Penandatanganan transaksi (pycspr)
│       ├── rwa_oracle.py       # Harga PAXG / UST10Y / WTI
│       ├── mcp_server.py       # MCP server — tool blockchain untuk Claude
│       └── x402.py             # X402 micropayment handler
├── frontend/src/
│   ├── app/page.tsx            # Cyber dashboard utama
│   └── components/
│       ├── DeployPanel.tsx     # Deploy contract
│       ├── VaultControls.tsx   # Register agent + deposit
│       ├── RWAPanel.tsx        # Tampilan real-world asset
│       ├── DecisionLog.tsx     # Histori keputusan AI
│       └── ChatBox.tsx         # AI chat
└── .github/workflows/
    └── deploy-contract.yml     # CI: auto-build WASM
```

---

## Troubleshooting

### Agent selalu HOLD

**Kemungkinan penyebab:**

1. **`ANTHROPIC_API_KEY` belum dikonfigurasi** — Cek log Railway/backend. Jika ada pesan `⚠ ANTHROPIC_API_KEY is not set`, tambahkan key di environment variables Railway/Vercel.

2. **Portofolio sudah di alokasi optimal** — Jika reasoning berbunyi `"Portfolio already at optimal 40/45/15 allocation"`, agen memang benar HOLD karena tidak perlu rebalance.

3. **Quota rebalance habis** — Jika reasoning berbunyi `"Daily rebalance quota exhausted (5/5)"`, tunggu hingga tengah malam UTC untuk reset. Bisa dinaikkan via `MAX_REBALANCES_PER_DAY`.

4. **Kondisi pasar tidak memenuhi threshold** — AI hanya REBALANCE jika premium yield aggressive >8% di atas risk-free rate dan conservative >8% APY. Jika kondisi pasar tidak memenuhi, HOLD adalah keputusan yang benar.

### Backend tidak connect ke Anthropic API

Cek log:
```
WARNING agent.decision_engine — ANTHROPIC_API_KEY is not configured
```
→ Set `ANTHROPIC_API_KEY=sk-ant-...` di Railway Variables.

```
WARNING agent.decision_engine — Anthropic unexpected error: Connection error
```
→ Cek koneksi network Railway, pastikan tidak ada firewall yang memblokir `api.anthropic.com`.

### Frontend tidak connect ke backend

- Pastikan `NEXT_PUBLIC_BACKEND_URL` di Vercel sudah diisi dengan URL Railway yang benar
- Cek Railway: pastikan service sudah running (status hijau)
- Cek CORS: backend secara default mengizinkan semua origin (`*`)

### Transaksi gagal (TX_FAILED)

- Pastikan agent account punya saldo CSPR untuk gas (~5 CSPR per transaksi)
- Cek `AGENT_SECRET_KEY_PATH` atau `AGENT_SECRET_KEY_CONTENT` sudah benar
- Cek `VAULT_CONTRACT_HASH` sesuai dengan contract yang sudah deploy

### Port sudah dipakai (local dev)

```bash
# Cek proses yang pakai port 8000
netstat -ano | findstr :8000   # Windows
lsof -i :8000                  # Linux/Mac
```

---

## Catatan Penting Operasional

- Agent membutuhkan **saldo CSPR di akun agent** untuk membayar gas transaksi rebalance (~5 CSPR per eksekusi)
- Maksimal **5 rebalance per hari** (dapat diubah via `MAX_REBALANCES_PER_DAY`)
- Setelah 5 rebalance, agen terus memantau tapi tidak akan eksekusi sampai reset tengah malam UTC
- Semua transaksi dapat dicek di [testnet.cspr.live](https://testnet.cspr.live)
- Smart contract sudah live di Casper Testnet — **jangan gunakan CSPR mainnet**

---

## Roadmap

### Phase 1 — Buildathon MVP ✅
- YieldVault contract di Casper Testnet
- Agen AI otonom (Claude) dengan loop keputusan 60 detik
- RWA oracle on-chain posting (PAXG, UST10Y)
- Real-time cyber dashboard dengan WebSocket

### Phase 2 — DeFi Integration (Q3 2026)
- Integrasi protokol DeFi Casper yang sesungguhnya
- Feed yield rate live dari sumber on-chain
- Dukungan multi-vault strategy
- Notifikasi mobile (Telegram bot)

### Phase 3 — Production Launch (Q4 2026)
- Deploy ke Casper Mainnet
- X402 fee-based API untuk akses institusional
- DAO governance untuk parameter strategi
- Smart contract yang sudah diaudit

---

## Komunitas & Vote

Jika project ini bermanfaat, tolong **vote untuk Agent Casper AI** di [CSPR.fans](https://cspr.fans) untuk membantu kami masuk Final Round Buildathon!

---

## Lisensi

MIT License — Copyright (c) 2026 Soesoe

---

Built for the **Casper Agentic AI Buildathon 2026**  
Stack: Claude AI · CSPR.cloud · Odra 2.7.2 · casper-js-sdk v5 · FastAPI · Next.js
