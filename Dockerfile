FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ARG PUBLIC_POCKETBASE_URL=http://pb.169.58.224.56.sslip.io
ENV PUBLIC_POCKETBASE_URL=$PUBLIC_POCKETBASE_URL
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
