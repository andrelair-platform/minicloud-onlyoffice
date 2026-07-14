FROM onlyoffice/documentserver:8.3.3

USER root

# Add minicloud self-signed CA so the document services can reach Nextcloud
# via HTTPS (cloud.devandre.sbs / cloud.10.0.0.200.nip.io) without errors.
COPY certs/minicloud-ca.crt /usr/local/share/ca-certificates/minicloud-ca.crt
RUN update-ca-certificates

# Node.js ignores the OS trust store — point it at our CA explicitly so
# ds:docservice and ds:converter can verify TLS when fetching/saving documents.
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/minicloud-ca.crt
