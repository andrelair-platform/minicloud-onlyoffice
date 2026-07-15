FROM onlyoffice/documentserver:8.3.3

USER root

# CA cert injected at build time via --build-arg (CI passes MINICLOUD_CA_CERT secret).
# Never committed to the repo — internal infrastructure detail.
ARG CA_CERT
RUN echo "${CA_CERT}" > /usr/local/share/ca-certificates/minicloud-ca.crt \
    && update-ca-certificates

# Node.js ignores the OS trust store — point it at our CA explicitly so
# ds:docservice and ds:converter can verify TLS when fetching/saving documents.
ENV NODE_EXTRA_CA_CERTS=/usr/local/share/ca-certificates/minicloud-ca.crt
