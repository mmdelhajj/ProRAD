package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/proisp/backend/internal/config"
	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
	"github.com/proisp/backend/internal/radius"
)

func main() {
	log.Println("Starting ProISP RADIUS Server...")

	// Load configuration
	cfg := config.Load()

	// Connect to database
	if err := database.Connect(cfg); err != nil {
		log.Fatalf("Failed to connect to database: %v", err)
	}
	defer database.Close()

	// Run migrations (just in case)
	if err := models.AutoMigrate(database.DB); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Create and start RADIUS server
	server := radius.NewServer(cfg.RadiusAuthPort, cfg.RadiusAcctPort)
	if err := server.Start(); err != nil {
		log.Fatalf("Failed to start RADIUS server: %v", err)
	}

	log.Printf("RADIUS server started (auth: %d, acct: %d)", cfg.RadiusAuthPort, cfg.RadiusAcctPort)

	// Periodically reload NAS secrets
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		for range ticker.C {
			if err := server.LoadSecrets(); err != nil {
				log.Printf("Failed to reload secrets: %v", err)
			}
		}
	}()

	// Wait for shutdown signal
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	log.Println("Shutting down RADIUS server...")
}
