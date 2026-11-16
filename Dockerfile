FROM node:26-alpine AS frontend
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web ./web
RUN npm run build

FROM golang:1.26-alpine AS backend
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY main.go ./
COPY server ./server
COPY --from=frontend /src/web/dist ./web/dist
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /club .

FROM alpine:3.23
RUN apk add --no-cache ca-certificates tzdata && addgroup -S club && adduser -S club -G club
COPY --from=backend /club /usr/local/bin/club
USER club
EXPOSE 19080
ENTRYPOINT ["club"]
