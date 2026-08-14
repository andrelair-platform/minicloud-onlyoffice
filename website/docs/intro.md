---
id: intro
title: Overview
sidebar_label: Overview
slug: /
---

# minicloud OnlyOffice

Custom **OnlyOffice DocumentServer** container image — minicloud CA certificate injected via `NODE_EXTRA_CA_CERTS` so the Node.js runtime trusts internal HTTPS endpoints, enabling Nextcloud integration over the cluster's self-signed TLS.

## Responsibility

| In scope | Out of scope |
|---|---|
| CA cert injection (`NODE_EXTRA_CA_CERTS`) | Nextcloud configuration (minicloud-gitops) |
| Custom entrypoint wrapper | OnlyOffice feature/connector config |

## Stack

| Concern | Choice |
|---|---|
| Base image | `onlyoffice/documentserver:8.x` |
| Runtime | Node.js (OnlyOffice internal) |
| CA injection | `NODE_EXTRA_CA_CERTS` environment variable |
| Registry | `harbor.10.0.0.200.nip.io/library/onlyoffice` |
| Integration | Nextcloud (`cloud.devandre.sbs`) via WOPI |

## Why a custom image?

OnlyOffice makes outbound HTTPS calls to validate Nextcloud tokens. Without trusting the minicloud CA, every document open fails with a TLS certificate error. Baking the CA into the image rather than mounting it at runtime avoids a ConfigMap dependency.

## Links

- [GitHub repository](https://github.com/andrelair-platform/minicloud-onlyoffice)
- [Platform documentation](https://andrelair-platform.github.io/minicloud-platform-docs/)
