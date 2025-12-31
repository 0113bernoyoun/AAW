# Multi-Stage Dockerfile for AAW Backend (Spring Boot/Kotlin)
# Stage 1: Build the application using Gradle
FROM --platform=linux/amd64 gradle:8.5-jdk21-alpine AS builder

WORKDIR /app

# Copy Gradle configuration files first for better caching
COPY build.gradle.kts settings.gradle.kts ./

# Copy source code
COPY src ./src

# Build the bootJar (Spring Boot executable JAR)
RUN gradle bootJar --no-daemon

# Stage 2: Runtime image with JRE only
FROM --platform=linux/amd64 eclipse-temurin:21-jre-alpine

# Create non-root user for security
RUN addgroup -S spring && adduser -S spring -G spring

# Switch to non-root user
USER spring:spring

# Set working directory
WORKDIR /app

# Copy the built JAR from builder stage
COPY --from=builder /app/build/libs/*.jar app.jar

# Expose application port
EXPOSE 8080

# Health check using wget (included in alpine)
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/actuator/health || exit 1

# JVM optimizations for container environment
# -XX:+UseContainerSupport: Respect container CPU/memory limits
# -XX:MaxRAMPercentage=75.0: Use up to 75% of container memory
ENTRYPOINT ["java", \
    "-XX:+UseContainerSupport", \
    "-XX:MaxRAMPercentage=75.0", \
    "-Djava.security.egd=file:/dev/./urandom", \
    "-jar", \
    "app.jar"]
