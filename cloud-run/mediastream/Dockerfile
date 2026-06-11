FROM node:20-slim
WORKDIR /app
# ffmpeg for Gemini Live audio resampling (PCM 24kHz → mulaw 8kHz).
# Hand-rolled DSP produced buzzy/aliasing distortion across 5 attempts; ffmpeg's
# polyphase resampler is the production-grade reference.
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=8080
EXPOSE 8080
CMD ["node", "index.js"]
