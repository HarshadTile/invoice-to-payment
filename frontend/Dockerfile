# MPayVision (Invoice to Payment Tracker) - frontend (React) image for Cloud Run.
#
#   docker build -t i2p-frontend .
#   docker run -p 8080:8080 i2p-frontend
#
# Stage 1 builds the static files with Node; stage 2 serves only those files with nginx (no Node, no
# source code in the final image). The app calls the API at /api/... on its own address: the load
# balancer sends /api/* to the backend service (see the backend's docs/deployment.md).

FROM node:24-alpine AS build
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Vite bakes VITE_* values into the files at build time; the live API is the only mode for a deployment.
ARG VITE_USE_FASTAPI_INVOICES=true
ENV VITE_USE_FASTAPI_INVOICES=$VITE_USE_FASTAPI_INVOICES
RUN npm run build

# nginx that runs as a normal user and listens on 8080 (Cloud Run's port).
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 8080
