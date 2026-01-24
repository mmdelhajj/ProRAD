# Build stage
FROM golang:1.21-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the API server
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /api ./cmd/api

# Final stage
FROM alpine:3.19

WORKDIR /app

# Install ca-certificates, timezone, postgresql-client for backups, and freeradius-utils for radclient CoA
RUN apk --no-cache add ca-certificates tzdata postgresql-client freeradius-utils

# Copy binary from builder
COPY --from=builder /api .

# Expose port
EXPOSE 8080

# Run the server
CMD ["./api"]
