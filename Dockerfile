# ---- build stage ----
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .

# ---- runtime stage ----
FROM node:20-alpine
WORKDIR /app
RUN apk add --no-cache dumb-init
ENV NODE_ENV=production
COPY --from=build /app /app
RUN addgroup -S nodegrp && adduser -S nodeusr -G nodegrp
USER nodeusr
EXPOSE 8080
CMD ["dumb-init", "node", "app.js"]
