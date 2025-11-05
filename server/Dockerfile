# Dockerfile para servidor JavaScript
FROM node:18-alpine

WORKDIR /app

# Copiar package.json primeiro para cache de dependências
COPY package.json ./

# Copiar código fonte (node_modules será excluído pelo .dockerignore)
COPY . ./

# Script de entrada que instala dependências e executa
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'cd /app' >> /entrypoint.sh && \
    echo 'npm install' >> /entrypoint.sh && \
    echo 'exec node main.js' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh

CMD ["/entrypoint.sh"]
