# minicloud-onlyoffice

[![CI](https://github.com/andrelair-platform/minicloud-onlyoffice/actions/workflows/ci.yml/badge.svg)](https://github.com/andrelair-platform/minicloud-onlyoffice/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![OnlyOffice](https://img.shields.io/badge/OnlyOffice-8.3.3-blue)](https://www.onlyoffice.com)
[![Supply chain: cosign](https://img.shields.io/badge/supply%20chain-cosign%20signed-green)](https://github.com/sigstore/cosign)

> Custom OnlyOffice DocumentServer image for the minicloud enterprise Kubernetes platform. Extends the official `onlyoffice/documentserver:8.3.3` image with the minicloud self-signed CA baked in and `NODE_EXTRA_CA_CERTS` set, enabling real-time `.docx` / `.xlsx` / `.pptx` co-editing inside Nextcloud over internal HTTPS.

**Live demo:** [https://cloud.devandre.sbs](https://cloud.devandre.sbs) — open any Office document to trigger OnlyOffice.

---

## Table of Contents

- [Why a custom image?](#why-a-custom-image)
- [What this image adds](#what-this-image-adds)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [CI/CD Pipeline](#cicd-pipeline)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

---

## Why a custom image?

The upstream `onlyoffice/documentserver` image does not trust self-signed CAs out of the box. The minicloud platform uses a private CA for all internal TLS (`*.10.0.0.200.nip.io`). Without the CA baked in, two things break:

| Problem | Symptom | Root cause |
|---|---|---|
| OS trust store missing minicloud CA | Nextcloud ↔ OnlyOffice JWT handshake fails, documents open in read-only | `libssl` rejects the self-signed TLS cert |
| Node.js ignores OS trust store | `ds:docservice` / `ds:converter` services throw TLS errors in logs | Node.js uses its own bundled CA store — `SSL_CERT_FILE` has no effect on Node.js |

This image fixes both at the Dockerfile level so the runtime deployment is clean — no init containers, no TLS workarounds in the Helm values.

---

## What this image adds

### 1. OS-level CA trust (`update-ca-certificates`)

```dockerfile
ARG CA_CERT
RUN echo "${CA_CERT}" > /usr/local/share/ca-certificates/minicloud-ca.crt \
    && update-ca-certificates
```

The minicloud CA PEM is injected at build time via `--build-arg CA_CERT=...` (never committed to the repo). `update-ca-certificates` appends it to the system bundle, trusting it for all `libssl`-backed processes.

### 2. Node.js CA trust (`NODE_EXTRA_CA_CERTS`)

```dockerfile
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/minicloud-ca.crt
```

Node.js ignores the OS trust store entirely. Setting `NODE_EXTRA_CA_CERTS` to the injected CA file is the only supported way to extend Node.js's built-in CA bundle. This makes `ds:docservice` and `ds:converter` — the two Node.js components inside DocumentServer — trust internal HTTPS endpoints.

### 3. Security patching

```dockerfile
RUN printf '#!/bin/sh\nexit 101\n' > /usr/sbin/policy-rc.d && chmod +x /usr/sbin/policy-rc.d && \
    apt-mark hold msodbcsql18 msodbcsql17 2>/dev/null || true && \
    apt-get update && apt-get upgrade -y --no-install-recommends && \
    rm -rf /var/lib/apt/lists/* && rm /usr/sbin/policy-rc.d
```

The upstream image ships with packages that have known CRITICAL CVEs. This layer upgrades all fixable packages at build time. Two package-specific workarounds are in place:

- `policy-rc.d` returning `101` — prevents `invoke-rc.d` from trying to start/stop services (e.g. nginx) inside the Docker build context, which would otherwise fail with exit 100
- `apt-mark hold msodbcsql18 msodbcsql17` — Microsoft ODBC driver's pre-install script exits non-zero in a container; holding the package skips it while still upgrading everything else

---

## Architecture

```
minicloud-onlyoffice (this repo)
    │
    │  docker build --build-arg CA_CERT=<pem>
    ▼
harbor.10.0.0.200.nip.io/library/onlyoffice:<sha>-amd64
    │
    │  CI bumps manifests/nextcloud/10-onlyoffice.yaml in minicloud-gitops
    ▼
ArgoCD (nextcloud app) → deploys to nextcloud namespace on k3s
    │
    │  OnlyOffice Integration app in Nextcloud points to the OnlyOffice service
    ▼
Users open .docx / .xlsx / .pptx files in Nextcloud → real-time co-editing
```

| Component | Detail |
|---|---|
| Base image | `onlyoffice/documentserver:8.3.3` |
| Registry | `harbor.10.0.0.200.nip.io/library/onlyoffice` (internal, via Tailscale) |
| Namespace | `nextcloud` |
| ArgoCD app | `nextcloud` |
| GitOps manifest | `minicloud-gitops/manifests/nextcloud/10-onlyoffice.yaml` |
| Nextcloud integration | OnlyOffice Integration app — points to `http://onlyoffice.nextcloud.svc.cluster.local` |

---

## Prerequisites

| Tool | Notes |
|---|---|
| Docker | Any recent version with BuildKit support |
| minicloud CA cert | Only required for local builds — production CI receives it via `MINICLOUD_CA_CERT` org secret |

---

## Getting Started

### Build locally

```bash
git clone https://github.com/andrelair-platform/minicloud-onlyoffice.git
cd minicloud-onlyoffice

# Inject the minicloud CA at build time (never committed to the repo)
docker build \
  --build-arg CA_CERT="$(cat ~/minicloud-ca.crt)" \
  -t onlyoffice:local .
```

> The `~/minicloud-ca.crt` path assumes the minicloud CA is symlinked there (standard on the Mac dev machine). Adjust the path if needed.

### Run locally (for quick smoke test)

```bash
docker run -i -t -d -p 80:80 \
  --name onlyoffice-test \
  onlyoffice:local
```

Open [http://localhost](http://localhost) — you should see the DocumentServer welcome page.

---

## Project Structure

```
minicloud-onlyoffice/
├── Dockerfile              # Single-stage build: security patches + CA injection
├── catalog-info.yaml       # Backstage catalog entity (Component, phase-58)
├── .github/
│   └── workflows/
│       └── ci.yml          # Build → push → Trivy scan → cosign sign → SBOM → gitops bump
└── .gitignore              # certs/ excluded — CA cert must never be committed
```

The repo is intentionally minimal. OnlyOffice is a large, self-contained application — the only purpose of this repo is to layer the minicloud CA and security patches on top of the upstream image.

---

## CI/CD Pipeline

Every push to `main` triggers `.github/workflows/ci.yml`:

```
push to main
    │
    ├─ 1. Free runner disk space (remove dotnet / android / ghc — ~15 GB freed)
    ├─ 2. Connect to Tailscale (OAuth — TS_OAUTH_CLIENT_ID / TS_OAUTH_SECRET)
    ├─ 3. Trust minicloud CA on the runner (raw PEM — no base64 decode)
    ├─ 4. docker build → push to harbor.10.0.0.200.nip.io/library/onlyoffice:<sha>-amd64
    │       CA_CERT injected via --build-arg (MINICLOUD_CA_CERT secret)
    ├─ 5. Trivy scan — fails on unfixed CRITICAL CVEs (15 min timeout — large image)
    ├─ 6. cosign sign (keyless — GitHub OIDC → Sigstore Fulcio)
    ├─ 7. syft SBOM (CycloneDX JSON) — attached as OCI referrer
    └─ 8. GPG-signed commit to minicloud-gitops bumping manifests/nextcloud/10-onlyoffice.yaml
              └─ ArgoCD webhook → rolling update in nextcloud namespace
```

### Required secrets

All 7 secrets are **org-level on `andrelair-platform`** (visibility: all). New forks or repos inherit them automatically — no per-repo secret setup.

| Secret | Purpose |
|---|---|
| `TS_OAUTH_CLIENT_ID` | Tailscale OAuth client ID — joins tailnet as `tag:ci` |
| `TS_OAUTH_SECRET` | Tailscale OAuth secret |
| `MINICLOUD_CA_CERT` | Self-signed CA PEM — trusts Harbor TLS and baked into the image |
| `HARBOR_USER` | Harbor registry username |
| `HARBOR_PASSWORD` | Harbor registry password |
| `GITOPS_TOKEN` | GitHub PAT (`repo` scope) for committing to `minicloud-gitops` |
| `GPG_PRIVATE_KEY` | Armored GPG private key for signing gitops commits (key ID `FD6D39D681DEFA34`) |

### OCI image index (build-push-action v7)

`docker/build-push-action@v7` pushes an OCI image index (manifest list wrapping the image + provenance attestation). The Harbor pre-flight check in `ci.yml` therefore passes the full OCI Accept header:

```bash
-H "Accept: application/vnd.oci.image.index.v1+json,application/vnd.docker.distribution.manifest.list.v2+json,application/vnd.docker.distribution.manifest.v2+json"
```

Without this header, Harbor returns 404 even when the tag exists.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Documents open in read-only inside Nextcloud | JWT token exchange failing — OnlyOffice can't verify Nextcloud's TLS cert | Verify `NODE_EXTRA_CA_CERTS` is set in the running pod: `kubectl exec -n nextcloud <pod> -- env \| grep NODE_EXTRA` |
| `TLS handshake error` in `ds:docservice` logs | Node.js CA bundle doesn't include the minicloud CA | Rebuild the image — check that `CA_CERT` build-arg was non-empty |
| CI fails: `msodbcsql18 pre-installation script returned error exit status 1` | Microsoft ODBC driver tries to run interactive setup in Docker | `apt-mark hold msodbcsql18 msodbcsql17` must appear before `apt-get upgrade` in the Dockerfile |
| CI fails: `invoke-rc.d: initscript nginx, action "start" failed` | nginx post-install script tries to start the service inside the build context | `policy-rc.d` returning 101 must be created before `apt-get upgrade` and removed after |
| CI fails: `no space left on device` during syft SBOM generation | OnlyOffice image is ~1.4 GB; runner disk fills up after build + Trivy pull | The "Free runner disk space" step at the top of the job handles this — verify it runs before `docker/setup-buildx-action` |
| Harbor pre-flight returns 404 after successful push | `build-push-action@v7` pushes an OCI index; Harbor needs explicit Accept header | Accept header already set in `ci.yml` — re-check if workflow was edited |

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for branch conventions, commit style, and how to propose changes.

---

## License

[MIT](LICENSE) © andrelair-platform
