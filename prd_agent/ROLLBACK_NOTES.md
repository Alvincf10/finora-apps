# Rollback Notes — Agent / Config (Phase 0)

Rollback **tidak** menyentuh data keuangan Finora (MongoDB).

## Kapan dipakai

- Regresi setelah ubah `openclaw.json`, plugin, atau routing model
- Gagal eksperimen DeepSeek / OpenRouter
- Hermes (nanti) mengganggu kanal produksi

## Prosedur OpenClaw

```bash
# 1) Backup config aktif sebelum restore (opsional)
cp -a /root/.openclaw/openclaw.json /root/.openclaw/openclaw.json.pre-rollback.$(date -u +%Y%m%dT%H%M%SZ)

# 2) Restore last-good
cp -a /var/backups/openclaw-phase0/openclaw.json.last-good /root/.openclaw/openclaw.json
chmod 600 /root/.openclaw/openclaw.json

# 3) Restart gateway
systemctl --user restart openclaw-gateway

# 4) Verifikasi
openclaw status
openclaw channels status
```

Alternatif archive config-only:

```bash
openclaw backup verify /var/backups/openclaw-phase0/openclaw-config-only.tar.gz
# Ikuti dokumentasi restore resmi OpenClaw untuk extract + apply
```

## Finora / Vira

```bash
systemctl status finora finora-vira
# Pastikan WA_PREFIX=finora di .env.local (shared number)
journalctl -u finora-vira -n 50 --no-pager
```

Jangan menghentikan `finora` hanya untuk rollback agent OpenClaw.

## Daily Planner

```bash
systemctl status daily-planner
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3001/api/webhook
```

Hook forward: `/root/.openclaw/hooks/forward-wa.sh` (salinan di `prd_agent/phase0-backup/…/openclaw/`).

## Cek pasca-rollback

- [ ] WhatsApp OpenClaw connected
- [ ] Pesan tanpa prefix dijawab OpenClaw (bukan Vira)
- [ ] Pesan `finora …` dijawab Vira
- [ ] Tidak ada pengiriman reminder ganda dari dua agent
- [ ] Tidak ada transaksi status ambigu di Finora akibat eksperimen write

## Artefak Phase 0

Lihat `prd_agent/CURRENT_STATE.md` §6 dan `prd_agent/phase0-backup/20261021T080026Z/MANIFEST.txt`.
