# Stage 1: 빌드 (TypeScript 컴파일)
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: 프로덕션 실행
FROM node:20-alpine AS runner

WORKDIR /app

COPY --from=builder /app/package.json /app/package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

EXPOSE 3001

CMD ["node", "dist/main"]
