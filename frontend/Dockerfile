FROM node:22-alpine AS build

# corepack reads the "packageManager" field in package.json to pin the pnpm version
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack install && pnpm install --frozen-lockfile

COPY . .
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN pnpm run build

# Serve the static build from nginx:alpine (~50 MB) instead of node+serve (~260 MB).
FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
