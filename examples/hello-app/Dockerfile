# Dockerfile contoh untuk menguji Deployment Worker Ronaldo Cloud.
# Aplikasi Node minimal tanpa dependency eksternal.
FROM node:22-alpine
WORKDIR /app
COPY . .
# Aplikasi mendengarkan port 3000 (samakan dengan containerPort service = 3000).
EXPOSE 3000
CMD ["node", "server.js"]
