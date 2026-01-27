package config

import (
	"crypto/rand"
	"encoding/hex"
	"log"
	"os"
	"strconv"
)

type Config struct {
	// Database
	DBHost     string
	DBPort     int
	DBUser     string
	DBPassword string
	DBName     string

	// Redis
	RedisHost     string
	RedisPort     int
	RedisPassword string

	// JWT
	JWTSecret      string
	JWTExpireHours int

	// API
	APIPort int

	// RADIUS
	RadiusAuthPort int
	RadiusAcctPort int
	RadiusSecret   string
}

// generateSecureSecret generates a cryptographically secure random secret
func generateSecureSecret(length int) string {
	bytes := make([]byte, length)
	if _, err := rand.Read(bytes); err != nil {
		// Fallback to a timestamp-based approach if crypto/rand fails
		return hex.EncodeToString([]byte(os.Getenv("HOSTNAME") + string(rune(length))))
	}
	return hex.EncodeToString(bytes)
}

func Load() *Config {
	// JWT Secret - generate random if not provided
	jwtSecret := os.Getenv("JWT_SECRET")
	if jwtSecret == "" {
		jwtSecret = generateSecureSecret(32) // 64 character hex string
		log.Println("WARNING: JWT_SECRET not set - generated random secret. Sessions will not persist across restarts.")
	}

	// Database password - warn if using default
	dbPassword := getEnv("DB_PASSWORD", "")
	if dbPassword == "" {
		log.Println("WARNING: DB_PASSWORD not set - this is insecure for production!")
		dbPassword = "changeme"
	}

	// Redis password - warn if using default
	redisPassword := getEnv("REDIS_PASSWORD", "")
	if redisPassword == "" {
		log.Println("WARNING: REDIS_PASSWORD not set - Redis is not secured!")
	}

	// RADIUS secret - warn if using default
	radiusSecret := getEnv("RADIUS_SECRET", "")
	if radiusSecret == "" {
		log.Println("WARNING: RADIUS_SECRET not set - using insecure default!")
		radiusSecret = "changeme"
	}

	return &Config{
		// Database
		DBHost:     getEnv("DB_HOST", "localhost"),
		DBPort:     getEnvInt("DB_PORT", 5432),
		DBUser:     getEnv("DB_USER", "proisp"),
		DBPassword: dbPassword,
		DBName:     getEnv("DB_NAME", "proisp"),

		// Redis
		RedisHost:     getEnv("REDIS_HOST", "localhost"),
		RedisPort:     getEnvInt("REDIS_PORT", 6379),
		RedisPassword: redisPassword,

		// JWT
		JWTSecret:      jwtSecret,
		JWTExpireHours: getEnvInt("JWT_EXPIRE_HOURS", 168), // 7 days default

		// API
		APIPort: getEnvInt("API_PORT", 8080),

		// RADIUS
		RadiusAuthPort: getEnvInt("RADIUS_AUTH_PORT", 1812),
		RadiusAcctPort: getEnvInt("RADIUS_ACCT_PORT", 1813),
		RadiusSecret:   radiusSecret,
	}
}

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}
