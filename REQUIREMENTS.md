# Casper Agentic Buildathon 2026 — Requirements Analysis

## 1. Konteks & Tujuan

Buildathon ini meminta peserta membangun **aplikasi Web3 production-ready** yang menggabungkan:
- **Agentic AI** — sistem AI otonom yang bisa mengambil keputusan dan bertindak sendiri
- **DeFi** — keuangan terdesentralisasi (yield, liquidity, trading)
- **Real-World Assets (RWA)** — aset dunia nyata yang di-tokenisasi on-chain
- **Casper Network** — blockchain yang menjadi platform deployment

---

## 2. Kriteria Wajib (Submission Requirements)

| Requirement | Detail |
|---|---|
| Working Prototype | Deploy di Casper Testnet |
| On-Chain Component | Harus ada transaksi nyata yang diproduksi |
| GitHub Repository | Open-source + README + dokumentasi |
| Demo Video | Video publik: fitur + walkthrough |

---

## 3. Kriteria Penilaian Final Round

| Kriteria | Bobot | Strategi |
|---|---|---|
| Technical Execution | Tinggi | Clean code, arsitektur solid |
| Innovation & Originality | Tinggi | Kombinasi AI agent + on-chain execution |
| Use of AI / Agentic Systems | Sangat Tinggi | Integrasi Claude AI untuk keputusan otomatis |
| Real-World Applicability | Tinggi | Yield optimization adalah use case nyata DeFi |
| User Experience & Design | Sedang | Dashboard real-time yang intuitif |
| Working Smart Contracts | Wajib | Odra framework di Casper Testnet |
| Long-Term Launch Plans | Sedang | Roadmap + social presence |
| Potential for Long-Term Impact | Tinggi | Skalabilitas ke mainnet |

---

## 4. Proyek yang Dipilih: CasperYield AI

### Nama: **CasperYield AI — Autonomous DeFi Yield Optimization Agent**

### Konsep Inti
Sebuah AI agent otonom yang:
1. **Memantau** yield opportunities di protokol DeFi Casper secara real-time
2. **Menganalisis** risiko dan potensi return menggunakan Claude AI
3. **Mengeksekusi** transaksi rebalancing portfolio secara otomatis via smart contract
4. **Melaporkan** setiap keputusan dan transaksi melalui dashboard web

---

## 5. Arsitektur Sistem

```
┌─────────────────────────────────────────────────┐
│                  FRONTEND                        │
│         Next.js Dashboard (Real-time)            │
│  [Portfolio] [Agent Log] [Transactions] [Config] │
└──────────────────┬──────────────────────────────┘
                   │ HTTP / WebSocket
┌──────────────────▼──────────────────────────────┐
│                  BACKEND                         │
│            FastAPI AI Agent Server               │
│                                                  │
│  ┌─────────────┐    ┌──────────────────────┐    │
│  │ Claude AI   │    │  Decision Engine      │    │
│  │ (LLM Core)  │◄──►│  - Risk Assessment   │    │
│  └─────────────┘    │  - Yield Comparison  │    │
│                     │  - Rebalance Logic   │    │
│                     └──────────┬───────────┘    │
└──────────────────────────────┬─┴────────────────┘
                               │
         ┌─────────────────────┼─────────────────┐
         │                     │                 │
┌────────▼────────┐  ┌─────────▼──────┐  ┌──────▼──────┐
│  CSPR.cloud API │  │  x402 Payment  │  │  MCP Server │
│  (Blockchain    │  │  Protocol      │  │  (Casper    │
│   Middleware)   │  │  (Micropay)    │  │   Queries)  │
└────────┬────────┘  └───────┬────────┘  └──────┬──────┘
         │                   │                  │
         └───────────────────┼──────────────────┘
                             │
┌────────────────────────────▼────────────────────┐
│                CASPER TESTNET                    │
│                                                  │
│  ┌──────────────────────────────────────────┐   │
│  │         YieldVault Smart Contract         │   │
│  │  (Odra Framework / Rust)                  │   │
│  │                                           │   │
│  │  - deposit()      - withdraw()            │   │
│  │  - rebalance()    - getPortfolio()        │   │
│  │  - setStrategy()  - emergencyPause()      │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

---

## 6. Stack Teknologi

### Smart Contract
- **Bahasa**: Rust
- **Framework**: Odra (Casper-native)
- **Deploy**: Casper Testnet

### Backend / AI Agent
- **Runtime**: Python 3.11+
- **Framework**: FastAPI
- **AI Core**: Anthropic Claude API (claude-sonnet-4-6)
- **Blockchain Client**: CSPR.cloud REST API
- **Payment**: x402 Protocol

### Frontend
- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Charts**: Recharts
- **State**: Zustand
- **Real-time**: WebSocket

---

## 7. Fitur Utama

### AI Agent Capabilities
- [ ] Monitoring yield otomatis setiap N detik
- [ ] Analisis risiko berbasis LLM (Claude)
- [ ] Autonomous rebalancing decision
- [ ] Transaction execution via smart contract
- [ ] Alert system untuk event kritis

### Smart Contract (YieldVault)
- [ ] Deposit dan withdraw CSPR
- [ ] Multi-strategy yield allocation
- [ ] Rebalancing dengan role-based access (agent)
- [ ] Event emission untuk audit trail
- [ ] Emergency pause mechanism

### Dashboard
- [ ] Real-time portfolio value chart
- [ ] Agent decision log dengan reasoning
- [ ] Transaction history on-chain
- [ ] Yield comparison antar strategi
- [ ] Konfigurasi parameter agent

---

## 8. Alur Kerja Agent

```
1. MONITOR  → Fetch yield rates dari CSPR.cloud setiap 60 detik
2. ANALYZE  → Kirim data ke Claude AI untuk risk & yield analysis
3. DECIDE   → Claude output: HOLD / REBALANCE / ALERT
4. EXECUTE  → Jika REBALANCE: sign & submit transaksi ke YieldVault contract
5. RECORD   → Log keputusan + tx hash ke database + emit event on-chain
6. REPORT   → Update dashboard via WebSocket
```

---

## 9. Struktur Direktori

```
casper-yield-agent/
├── REQUIREMENTS.md         ← Dokumen ini
├── README.md               ← Dokumentasi publik
├── contracts/              ← Odra smart contracts (Rust)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       └── yield_vault.rs
├── backend/                ← AI Agent + API server
│   ├── requirements.txt
│   ├── .env.example
│   ├── main.py
│   ├── agent/
│   │   ├── yield_agent.py      ← Core AI agent loop
│   │   └── decision_engine.py  ← Claude AI integration
│   └── casper/
│       ├── client.py           ← CSPR.cloud client
│       └── x402.py             ← x402 payment handler
└── frontend/               ← Next.js dashboard
    ├── package.json
    ├── next.config.js
    └── src/
        ├── app/
        │   ├── layout.tsx
        │   └── page.tsx
        └── components/
            ├── AgentDashboard.tsx
            ├── PortfolioChart.tsx
            ├── DecisionLog.tsx
            └── TransactionFeed.tsx
```

---

## 10. Roadmap

| Fase | Target | Status |
|---|---|---|
| Phase 1 | Smart contract deployed di Testnet | Q2 2026 |
| Phase 2 | AI agent live + dashboard | Q2 2026 |
| Phase 3 | Mainnet deployment | Q3 2026 |
| Phase 4 | Multi-protocol support | Q4 2026 |
| Phase 5 | Mobile app + community governance | Q1 2027 |
