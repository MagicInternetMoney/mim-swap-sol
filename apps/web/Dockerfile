FROM node:22-alpine AS deps

WORKDIR /workspace/apps/web
COPY apps/web/package.json apps/web/package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM deps AS build

WORKDIR /workspace
COPY . .
WORKDIR /workspace/apps/web
RUN npm run build

FROM nginx:1.27-alpine

COPY .docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 80
