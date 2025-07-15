FROM node:18-bullseye

# 1. Instala dependencias del sistema + Chromium
RUN apt-get update && \
    apt-get install -y \
    chromium \
    libnss3 \
    libx11-6 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    libglib2.0-0 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

# 2. Configura entorno para Chromium
ENV CHROMIUM_PATH=/usr/bin/chromium
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV DISABLE_PLAYWRIGHT_TEST=1

WORKDIR /app

# 3. Instala dependencias (excluyendo playwright del bundle final)
COPY package*.json ./
RUN npm ci --omit=dev

# 4. Copia el código
COPY . .

EXPOSE 3000

CMD ["node", "src/server.js"]