package database

import (
	"context"
	"encoding/json"
	"time"
)

const (
	// Cache key prefixes
	CacheKeySettings   = "proisp:settings"
	CacheKeyNASList    = "proisp:nas:list"
	CacheKeyServices   = "proisp:services:all"
	CacheKeyNAS        = "proisp:nas:"

	// Cache TTLs
	CacheTTLSettings = 5 * time.Minute
	CacheTTLNAS      = 2 * time.Minute
	CacheTTLServices = 2 * time.Minute
)

// CacheGet retrieves a value from Redis cache and unmarshals it into dest
func CacheGet(key string, dest interface{}) error {
	ctx := context.Background()
	data, err := Redis.Get(ctx, key).Bytes()
	if err != nil {
		return err
	}
	return json.Unmarshal(data, dest)
}

// CacheSet stores a value in Redis cache with TTL
func CacheSet(key string, value interface{}, ttl time.Duration) error {
	ctx := context.Background()
	data, err := json.Marshal(value)
	if err != nil {
		return err
	}
	return Redis.Set(ctx, key, data, ttl).Err()
}

// CacheDelete removes a key from Redis cache
func CacheDelete(keys ...string) error {
	if len(keys) == 0 {
		return nil
	}
	ctx := context.Background()
	return Redis.Del(ctx, keys...).Err()
}

// CacheDeletePattern deletes all keys matching a pattern (use with caution)
func CacheDeletePattern(pattern string) error {
	ctx := context.Background()
	iter := Redis.Scan(ctx, 0, pattern, 0).Iterator()
	var keys []string
	for iter.Next(ctx) {
		keys = append(keys, iter.Val())
	}
	if err := iter.Err(); err != nil {
		return err
	}
	if len(keys) > 0 {
		return Redis.Del(ctx, keys...).Err()
	}
	return nil
}

// InvalidateNASCache clears all NAS-related caches
func InvalidateNASCache() {
	CacheDelete(CacheKeyNASList)
	CacheDeletePattern(CacheKeyNAS + "*")
}

// InvalidateServicesCache clears all services-related caches
func InvalidateServicesCache() {
	CacheDelete(CacheKeyServices)
}

// InvalidateSettingsCache clears settings cache
func InvalidateSettingsCache() {
	CacheDelete(CacheKeySettings)
}
