# Finora Security Assessment Report

| Field | Value |
|-------|-------|
| **Target** | `finora.spidernet.web.id` (Finora personal finance) |
| **Date** | 2026-10-16 |
| **Scope** | App code, Auth.js, API authorization, WhatsApp Vira, MongoDB, nginx, systemd |
| **Classification** | INTERNAL — own asset |
| **Overall verdict** | **SECURE for personal single-user use** |

---

## Executive summary

Finora was reviewed and hardened. Critical/high issues from the initial audit (open registration, WhatsApp without sender allowlist, Mongo without auth, root services, middleware gaps) have been remediated and re-verified.

Registration is **permanently disabled** — this deployment is for a single personal owner only.

**Sign-off:** With current controls, Finora is secure and safe for personal production use behind Cloudflare/nginx. Re-assess if multi-user access or new integrations are added.

---

## Control status

| Area | Status | Notes |
|------|--------|-------|
| Authentication | Pass | Auth.js JWT, bcrypt 12, Secure/HttpOnly cookies, login rate limit |
| Registration | Pass | Closed permanently; `/register` → login; API `403` |
| Authorization / IDOR | Pass | `requireUser()` + `userId` on all business APIs |
| WhatsApp (Vira) | Pass | `allowedFrom` + default account required |
| Transport | Pass | HTTPS + HSTS; Next on `127.0.0.1:3010` |
| Security headers | Pass | HSTS, frame deny, nosniff, CSP, Permissions-Policy |
| MongoDB | Pass | Auth enabled, localhost, UFW deny |
| Process hardening | Pass | `User=finora`, sandbox unit options |
| Secrets hygiene | Pass | `.env.local` 600, `.wa-auth` 700, gitignored |
| Error handling | Pass | Production sanitizes internal errors |
| Route protection | Pass | Middleware covers all app surfaces |

---

## Remediation log

| Severity | Finding | Fix |
|----------|---------|-----|
| HIGH | WA open to any DM | Require `allowedFrom`; worker hard-deny |
| HIGH | Public registration | Permanently disabled |
| HIGH | Mongo without auth | Authorization + credentialed URI |
| HIGH | Services as root | System user `finora` |
| MEDIUM | Middleware gaps | Protect `/alerts`, `/forecast`, `/recurring` |
| MEDIUM | No auth rate limits | Login rate limit; register closed |
| MEDIUM | World-readable secrets | Restricted file modes |
| MEDIUM | Error message leakage | Generic production errors |
| LOW | No CSP / public bind | nginx CSP; localhost bind |

---

## Verification

- Unauthenticated `/alerts`, `/forecast`, `/recurring` → `307`
- `POST /api/auth/register` → `403 REGISTER_DISABLED`
- `/register` → redirect to `/login`
- Next listens on `127.0.0.1:3010` only
- Unauthenticated Mongo commands → `Unauthorized`
- `finora` / `finora-vira` active as `User=finora`
- HTTPS responses include HSTS + CSP + Permissions-Policy

---

## Residual risk (accepted)

1. Login credential stuffing — mitigated by rate limit; Cloudflare/fail2ban optional.
2. WhatsApp session files on disk — host access is the trust boundary.
3. In-memory rate limits — fine for single-instance systemd.
4. CSP allows `'unsafe-inline'` for Next.js — baseline framing/object protections remain.

---

## Recommendation

**Approved for personal use.** No open HIGH findings. Keep `allowedFrom` configured before connecting Vira; do not re-enable registration without a new review.
