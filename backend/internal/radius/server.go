package radius

import (
	"bytes"
	"context"
	"crypto/des"
	"crypto/sha1"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
	"github.com/proisp/backend/internal/security"
	"golang.org/x/crypto/md4"
	"layeh.com/radius"
	"layeh.com/radius/rfc2865"
	"layeh.com/radius/rfc2866"
	"layeh.com/radius/rfc2869"
)

// getSettingInt retrieves an integer setting from database with default fallback
func getSettingInt(key string, defaultVal int) int {
	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", key).First(&pref).Error; err != nil {
		return defaultVal
	}
	if val, err := strconv.Atoi(pref.Value); err == nil {
		return val
	}
	return defaultVal
}

// getSettingBool retrieves a boolean setting from database with default fallback
func getSettingBool(key string, defaultVal bool) bool {
	var pref models.SystemPreference
	if err := database.DB.Where("key = ?", key).First(&pref).Error; err != nil {
		return defaultVal
	}
	return pref.Value == "true" || pref.Value == "1"
}

// Server represents a RADIUS server
type Server struct {
	authAddr string
	acctAddr string
	secrets  map[string][]byte // NAS IP -> Secret
}

// NewServer creates a new RADIUS server
func NewServer(authPort, acctPort int) *Server {
	return &Server{
		authAddr: fmt.Sprintf(":%d", authPort),
		acctAddr: fmt.Sprintf(":%d", acctPort),
		secrets:  make(map[string][]byte),
	}
}

// LoadSecrets loads NAS secrets from database
func (s *Server) LoadSecrets() error {
	var nasList []models.Nas
	if err := database.DB.Where("is_active = ?", true).Find(&nasList).Error; err != nil {
		return err
	}

	for _, nas := range nasList {
		s.secrets[nas.IPAddress] = []byte(nas.Secret)
	}

	log.Printf("Loaded %d NAS secrets", len(s.secrets))
	return nil
}

// GetSecret returns the secret for a NAS IP
func (s *Server) GetSecret(remoteAddr net.Addr) ([]byte, error) {
	host, _, err := net.SplitHostPort(remoteAddr.String())
	if err != nil {
		return nil, err
	}

	secret, ok := s.secrets[host]
	if !ok {
		return nil, fmt.Errorf("unknown NAS: %s", host)
	}

	return secret, nil
}

// SecretSource implements the radius.SecretSource interface
type SecretSource struct {
	server *Server
}

func (ss SecretSource) RADIUSSecret(ctx context.Context, remoteAddr net.Addr) ([]byte, error) {
	return ss.server.GetSecret(remoteAddr)
}

// Start starts the RADIUS server
func (s *Server) Start() error {
	// Load NAS secrets
	if err := s.LoadSecrets(); err != nil {
		return fmt.Errorf("failed to load secrets: %w", err)
	}

	secretSource := SecretSource{server: s}

	// Start authentication server
	go func() {
		authServer := radius.PacketServer{
			Addr:         s.authAddr,
			Network:      "udp",
			SecretSource: secretSource,
			Handler:      radius.HandlerFunc(s.handleAuth),
		}

		log.Printf("Starting RADIUS auth server on %s", s.authAddr)
		if err := authServer.ListenAndServe(); err != nil {
			log.Printf("Auth server error: %v", err)
		}
	}()

	// Start accounting server
	go func() {
		acctServer := radius.PacketServer{
			Addr:         s.acctAddr,
			Network:      "udp",
			SecretSource: secretSource,
			Handler:      radius.HandlerFunc(s.handleAcct),
		}

		log.Printf("Starting RADIUS acct server on %s", s.acctAddr)
		if err := acctServer.ListenAndServe(); err != nil {
			log.Printf("Acct server error: %v", err)
		}
	}()

	return nil
}

// handleAuth handles authentication requests
func (s *Server) handleAuth(w radius.ResponseWriter, r *radius.Request) {
	username := rfc2865.UserName_GetString(r.Packet)
	originalUsername := username // Keep original for logging
	nasIP := rfc2865.NASIPAddress_Get(r.Packet)
	callingStationID := rfc2865.CallingStationID_GetString(r.Packet)

	log.Printf("Auth request: user=%s, nas=%s, mac=%s", username, nasIP, callingStationID)

	// Start timing
	startTime := time.Now()

	// Handle realm stripping based on NAS configuration
	username = s.stripRealmIfAllowed(username, nasIP.String())
	if username != originalUsername {
		log.Printf("Realm stripped: %s -> %s", originalUsername, username)
	}

	// Get subscriber from cache or database
	subscriber, err := s.getSubscriber(username)
	if err != nil {
		log.Printf("Auth reject (user not found): %s", username)
		s.logPostAuth(username, callingStationID, "Access-Reject")
		w.Write(r.Response(radius.CodeAccessReject))
		return
	}

	// Check if subscriber is active
	if subscriber.Status != models.SubscriberStatusActive {
		log.Printf("Auth reject (inactive): %s", username)
		s.logPostAuth(username, callingStationID, "Access-Reject")
		w.Write(r.Response(radius.CodeAccessReject))
		return
	}

	// Check expiry
	if subscriber.IsExpired() {
		log.Printf("Auth reject (expired): %s", username)
		s.logPostAuth(username, callingStationID, "Access-Reject")
		w.Write(r.Response(radius.CodeAccessReject))
		return
	}

	// Decrypt password if encrypted
	plainPassword := security.DecryptPassword(subscriber.PasswordPlain)
	if plainPassword == "" {
		log.Printf("Auth reject (password decryption failed): %s", username)
		s.logPostAuth(username, callingStationID, "Access-Reject")
		w.Write(r.Response(radius.CodeAccessReject))
		return
	}

	// Try MS-CHAPv2 first (preferred for PPPoE)
	mschapChallenge := getMSCHAPChallenge(r.Packet)
	mschap2Response := getMSCHAP2Response(r.Packet)

	var authSuccess bool
	var mschap2SuccessResponse []byte

	if len(mschapChallenge) > 0 && len(mschap2Response) >= 50 {
		// MS-CHAPv2 authentication - use originalUsername for hash calculation (client uses full username with realm)
		authSuccess, mschap2SuccessResponse = verifyMSCHAP2(originalUsername, plainPassword, mschapChallenge, mschap2Response)
		if !authSuccess {
			log.Printf("Auth reject (MS-CHAPv2 failed): %s", username)
			s.logPostAuth(username, callingStationID, "Access-Reject")
			w.Write(r.Response(radius.CodeAccessReject))
			return
		}
		log.Printf("MS-CHAPv2 auth success for: %s", username)
	} else {
		// Fall back to PAP authentication
		password := rfc2865.UserPassword_GetString(r.Packet)
		if plainPassword != password {
			log.Printf("Auth reject (wrong password - PAP): %s", username)
			s.logPostAuth(username, callingStationID, "Access-Reject")
			w.Write(r.Response(radius.CodeAccessReject))
			return
		}
		authSuccess = true
		log.Printf("PAP auth success for: %s", username)
	}

	// Check MAC binding
	if subscriber.SaveMAC && subscriber.MACAddress != "" {
		normalizedMAC := strings.ToUpper(strings.ReplaceAll(callingStationID, "-", ":"))
		normalizedSavedMAC := strings.ToUpper(strings.ReplaceAll(subscriber.MACAddress, "-", ":"))
		if normalizedMAC != normalizedSavedMAC {
			log.Printf("Auth reject (MAC mismatch): %s, expected=%s, got=%s", username, subscriber.MACAddress, callingStationID)
			s.logPostAuth(username, callingStationID, "Access-Reject")
			w.Write(r.Response(radius.CodeAccessReject))
			return
		}
	}

	// Build response
	response := r.Response(radius.CodeAccessAccept)

	// Add MS-CHAP2-Success if MS-CHAPv2 was used
	if len(mschap2SuccessResponse) > 0 {
		// MS-CHAP2-Success is Microsoft VSA (Vendor 311, Attribute 26)
		vsaData := buildMicrosoftVSA(26, mschap2SuccessResponse)
		response.Add(26, vsaData)
	}

	// Add Mikrotik rate limit
	// Priority: 1) Per-subscriber bandwidth rule, 2) radreply (FUP), 3) service default
	var radReply models.RadReply
	var rateLimit string

	// First check for active per-subscriber bandwidth rule (highest priority)
	var subscriberRule models.SubscriberBandwidthRule
	if err := database.DB.Where("subscriber_id = ? AND rule_type = ? AND enabled = ?",
		subscriber.ID, models.BandwidthRuleTypeInternet, true).
		Order("priority DESC").First(&subscriberRule).Error; err == nil {
		// Check if rule is active (not expired)
		if subscriberRule.IsActiveNow() {
			rateLimit = fmt.Sprintf("%dk/%dk", subscriberRule.DownloadSpeed, subscriberRule.UploadSpeed)
			log.Printf("Using per-subscriber bandwidth rule for %s: %s (rule_id=%d, remaining=%s)",
				username, rateLimit, subscriberRule.ID, subscriberRule.TimeRemaining())
		}
	}

	// If no subscriber rule, check radreply for custom rate limit (FUP speeds)
	if rateLimit == "" {
		if err := database.DB.Where("username = ? AND attribute = ?", username, "Mikrotik-Rate-Limit").First(&radReply).Error; err == nil && radReply.Value != "" {
			// Use rate limit from radreply (FUP or custom speed)
			rateLimit = radReply.Value
			log.Printf("Using radreply rate limit for %s: %s", username, rateLimit)
		}
	}

	// If still no rate limit, fall back to service default speeds
	if rateLimit == "" {
		// Fall back to service default speeds
		uploadSpeed := subscriber.Service.UploadSpeedStr
		downloadSpeed := subscriber.Service.DownloadSpeedStr
		if uploadSpeed == "" && subscriber.Service.UploadSpeed > 0 {
			uploadSpeed = fmt.Sprintf("%dM", subscriber.Service.UploadSpeed)
		}
		if downloadSpeed == "" && subscriber.Service.DownloadSpeed > 0 {
			downloadSpeed = fmt.Sprintf("%dM", subscriber.Service.DownloadSpeed)
		}

		if uploadSpeed != "" || downloadSpeed != "" {
			rateLimit = fmt.Sprintf("%s/%s", uploadSpeed, downloadSpeed)

			// Add burst if configured
			if subscriber.Service.BurstUpload > 0 || subscriber.Service.BurstDownload > 0 {
				burstUp := subscriber.Service.BurstUpload
				burstDown := subscriber.Service.BurstDownload
				threshold := subscriber.Service.BurstThreshold
				burstTime := subscriber.Service.BurstTime

				rateLimit = fmt.Sprintf("%s/%s %d/%d %d/%d %d/%d",
					uploadSpeed, downloadSpeed,
					burstUp, burstDown,
					threshold, threshold,
					burstTime, burstTime)
			}
		}
	}

	if rateLimit != "" {
		// Set as vendor-specific attribute (Mikrotik-Rate-Limit)
		// Vendor ID: 14988, Attribute: 8
		vsaData := buildMikrotikVSA(8, []byte(rateLimit))
		response.Add(26, vsaData)
		log.Printf("Sending rate limit for %s: %s", username, rateLimit)
	}

	// Add IP pool
	if subscriber.Service.PoolName != "" {
		rfc2869.FramedPool_SetString(response, subscriber.Service.PoolName)
	}

	// Add static IP if assigned
	if subscriber.StaticIP != "" {
		ip := net.ParseIP(subscriber.StaticIP)
		if ip != nil {
			rfc2865.FramedIPAddress_Set(response, ip)
		}
	}

	// Add session timeout - use minimum of (time until expiry, default_session_timeout)
	defaultSessionTimeout := getSettingInt("default_session_timeout", 86400)
	remainingSeconds := int(time.Until(subscriber.ExpiryDate).Seconds())
	sessionTimeout := defaultSessionTimeout
	if remainingSeconds > 0 && remainingSeconds < defaultSessionTimeout {
		sessionTimeout = remainingSeconds
	}
	if sessionTimeout > 0 {
		rfc2865.SessionTimeout_Set(response, rfc2865.SessionTimeout(sessionTimeout))
	}

	// Add idle timeout from settings
	idleTimeout := getSettingInt("idle_timeout", 0)
	if idleTimeout > 0 {
		rfc2865.IdleTimeout_Set(response, rfc2865.IdleTimeout(idleTimeout))
	}

	// Add simultaneous use limit from subscriber settings
	simultaneousUse := subscriber.SimultaneousSessions
	if simultaneousUse <= 0 {
		simultaneousUse = 1
	}
	// Check global setting - if Allow Simultaneous Use is OFF, force to 1
	if !getSettingBool("simultaneous_use", false) && simultaneousUse > 1 {
		simultaneousUse = 1
	}
	// Add as Vendor-Specific Attribute for Mikrotik (Mikrotik-Recv-Limit, id=1)
	// Or use standard Session-Limit if supported
	// For now, we rely on radcheck Simultaneous-Use attribute which is set per-user

	// Update subscriber MAC if not saved
	if !subscriber.SaveMAC || subscriber.MACAddress == "" {
		go func() {
			database.DB.Model(&models.Subscriber{}).Where("id = ?", subscriber.ID).Update("mac_address", callingStationID)
		}()
	}

	// Log successful auth
	s.logPostAuth(username, callingStationID, "Access-Accept")

	duration := time.Since(startTime)
	log.Printf("Auth accept: %s (%.2fms)", username, float64(duration.Microseconds())/1000)

	w.Write(response)
}

// handleAcct handles accounting requests
func (s *Server) handleAcct(w radius.ResponseWriter, r *radius.Request) {
	username := rfc2865.UserName_GetString(r.Packet)
	acctStatusType := rfc2866.AcctStatusType_Get(r.Packet)
	sessionID := rfc2866.AcctSessionID_GetString(r.Packet)
	nasIP := rfc2865.NASIPAddress_Get(r.Packet)
	framedIP := rfc2865.FramedIPAddress_Get(r.Packet)
	callingStationID := rfc2865.CallingStationID_GetString(r.Packet)
	sessionTime := rfc2866.AcctSessionTime_Get(r.Packet)
	inputOctets := rfc2866.AcctInputOctets_Get(r.Packet)
	outputOctets := rfc2866.AcctOutputOctets_Get(r.Packet)
	terminateCause := rfc2866.AcctTerminateCause_Get(r.Packet)

	log.Printf("Acct request: user=%s, type=%d, session=%s", username, acctStatusType, sessionID)

	now := time.Now()

	switch acctStatusType {
	case rfc2866.AcctStatusType_Value_Start:
		// Session start
		acct := models.RadAcct{
			AcctSessionID:    sessionID,
			AcctUniqueID:     fmt.Sprintf("%s-%s-%d", username, sessionID, now.Unix()),
			Username:         username,
			NasIPAddress:     nasIP.String(),
			AcctStartTime:    &now,
			CallingStationID: callingStationID,
			FramedIPAddress:  framedIP.String(),
		}
		database.DB.Create(&acct)

		// Update subscriber online status
		go func() {
			database.DB.Model(&models.Subscriber{}).Where("username = ?", username).Updates(map[string]interface{}{
				"is_online":   true,
				"ip_address":  framedIP.String(),
				"session_id":  sessionID,
				"last_seen":   now,
				"mac_address": callingStationID,
			})
		}()

	case rfc2866.AcctStatusType_Value_Stop:
		// Session stop
		var cause string
		if terminateCause > 0 {
			cause = fmt.Sprintf("%d", terminateCause)
		}

		database.DB.Model(&models.RadAcct{}).Where("acct_session_id = ? AND username = ? AND acct_stop_time IS NULL", sessionID, username).Updates(map[string]interface{}{
			"acct_stop_time":       now,
			"acct_session_time":    sessionTime,
			"acct_input_octets":    inputOctets,
			"acct_output_octets":   outputOctets,
			"acct_terminate_cause": cause,
		})

		// Update subscriber status
		go func() {
			database.DB.Model(&models.Subscriber{}).Where("username = ?", username).Updates(map[string]interface{}{
				"is_online":  false,
				"session_id": "",
				"last_seen":  now,
			})

			// Update quota
			s.updateQuota(username, int64(inputOctets), int64(outputOctets))
		}()

	case rfc2866.AcctStatusType_Value_InterimUpdate:
		// Interim update
		database.DB.Model(&models.RadAcct{}).Where("acct_session_id = ? AND username = ? AND acct_stop_time IS NULL", sessionID, username).Updates(map[string]interface{}{
			"acct_update_time":   now,
			"acct_session_time":  sessionTime,
			"acct_input_octets":  inputOctets,
			"acct_output_octets": outputOctets,
		})

		// Update last seen
		go func() {
			database.DB.Model(&models.Subscriber{}).Where("username = ?", username).Update("last_seen", now)

			// Update quota
			s.updateQuota(username, int64(inputOctets), int64(outputOctets))
		}()
	}

	// Always respond with Accounting-Response
	w.Write(r.Response(radius.CodeAccountingResponse))
}

// getSubscriber gets subscriber from database with caching
func (s *Server) getSubscriber(username string) (*models.Subscriber, error) {
	// Try Redis cache first
	ctx := context.Background()
	cacheKey := fmt.Sprintf("subscriber:%s", username)

	// For now, always query database (add caching later)
	var subscriber models.Subscriber
	if err := database.DB.Preload("Service").Where("username = ?", username).First(&subscriber).Error; err != nil {
		return nil, err
	}

	// Cache in Redis
	go func() {
		database.Redis.Set(ctx, cacheKey, subscriber.ID, 5*time.Minute)
	}()

	return &subscriber, nil
}

// stripRealmIfAllowed strips the realm from username if it's in the NAS's allowed realms list
func (s *Server) stripRealmIfAllowed(username, nasIP string) string {
	// Check if username contains a realm (@domain)
	if !strings.Contains(username, "@") {
		return username
	}

	parts := strings.SplitN(username, "@", 2)
	if len(parts) != 2 {
		return username
	}

	user := parts[0]
	realm := strings.ToLower(parts[1])

	// Get NAS from database to check allowed realms
	var nas models.Nas
	if err := database.DB.Where("ip_address = ?", nasIP).First(&nas).Error; err != nil {
		// NAS not found, don't strip realm
		log.Printf("NAS not found for IP %s, keeping realm", nasIP)
		return username
	}

	// Check if NAS has allowed realms configured
	if nas.AllowedRealms == "" {
		// No realms configured, don't strip (require explicit configuration)
		return username
	}

	// Check if the realm is in the allowed list
	allowedRealms := strings.Split(nas.AllowedRealms, ",")
	for _, allowed := range allowedRealms {
		allowed = strings.TrimSpace(strings.ToLower(allowed))
		if allowed == realm {
			// Realm is allowed, strip it
			log.Printf("Realm '%s' is allowed for NAS %s, stripping from username", realm, nas.Name)
			return user
		}
	}

	// Realm not in allowed list, keep original username
	log.Printf("Realm '%s' not in allowed list for NAS %s", realm, nas.Name)
	return username
}

// logPostAuth logs authentication attempt
func (s *Server) logPostAuth(username, callingStationID, reply string) {
	log := models.RadPostAuth{
		Username:         username,
		CallingStationID: callingStationID,
		Reply:            reply,
	}
	database.DB.Create(&log)
}

// isWithinTimeWindow checks if the current time falls within the service's time-based speed window (FREE time)
func isWithinTimeWindow(service *models.Service, now time.Time) bool {
	// Skip if ratios are both 100 (no change) or time window not configured
	if service.TimeDownloadRatio == 100 && service.TimeUploadRatio == 100 {
		return false
	}
	if service.TimeFromHour == 0 && service.TimeFromMinute == 0 &&
		service.TimeToHour == 0 && service.TimeToMinute == 0 {
		return false
	}

	currentHour := now.Hour()
	currentMinute := now.Minute()
	currentTimeMinutes := currentHour*60 + currentMinute

	fromMinutes := service.TimeFromHour*60 + service.TimeFromMinute
	toMinutes := service.TimeToHour*60 + service.TimeToMinute

	// Handle time ranges that might cross midnight
	if fromMinutes <= toMinutes {
		// Normal range (e.g., 00:00 to 06:00 or 16:00 to 23:00)
		return currentTimeMinutes >= fromMinutes && currentTimeMinutes < toMinutes
	}
	// Crosses midnight (e.g., 22:00 to 06:00)
	return currentTimeMinutes >= fromMinutes || currentTimeMinutes < toMinutes
}

// updateQuota is called by RADIUS accounting but does NOT update subscriber quota fields.
// All quota tracking is handled by QuotaSyncService which uses delta-based calculation.
// This function only logs the accounting event for debugging purposes.
func (s *Server) updateQuota(username string, input, output int64) {
	// Quota tracking is handled entirely by QuotaSyncService
	// RADIUS accounting only updates radacct records (done in handleAcct)
	// We don't update subscriber quota fields here to avoid conflicts with QuotaSync
}

// checkFUP checks and applies Fair Usage Policy
// FUP is now handled by quota_sync service with multi-tier direct speeds
func (s *Server) checkFUP(subscriber *models.Subscriber) {
	// FUP is handled by QuotaSyncService which runs periodically
	// It checks thresholds and applies direct speeds (FUP1, FUP2, FUP3)
	// This function is kept for accounting updates but doesn't change FUP level
	// The QuotaSyncService will handle FUP enforcement based on:
	// - FUP1Threshold/FUP1DownloadSpeed/FUP1UploadSpeed
	// - FUP2Threshold/FUP2DownloadSpeed/FUP2UploadSpeed
	// - FUP3Threshold/FUP3DownloadSpeed/FUP3UploadSpeed
}

// MS-CHAPv2 Helper Functions

// getMSCHAPChallenge extracts MS-CHAP-Challenge from RADIUS packet (VSA 311:11)
func getMSCHAPChallenge(p *radius.Packet) []byte {
	for _, attr := range p.Attributes {
		if attr.Type == 26 { // Vendor-Specific
			if len(attr.Attribute) < 6 {
				continue
			}
			vendorID := binary.BigEndian.Uint32(attr.Attribute[0:4])
			if vendorID == 311 { // Microsoft
				vsaType := attr.Attribute[4]
				vsaLen := attr.Attribute[5]
				if vsaType == 11 && int(vsaLen) <= len(attr.Attribute)-4 { // MS-CHAP-Challenge
					return attr.Attribute[6 : 6+vsaLen-2]
				}
			}
		}
	}
	return nil
}

// getMSCHAP2Response extracts MS-CHAP2-Response from RADIUS packet (VSA 311:25)
func getMSCHAP2Response(p *radius.Packet) []byte {
	for _, attr := range p.Attributes {
		if attr.Type == 26 { // Vendor-Specific
			if len(attr.Attribute) < 6 {
				continue
			}
			vendorID := binary.BigEndian.Uint32(attr.Attribute[0:4])
			if vendorID == 311 { // Microsoft
				vsaType := attr.Attribute[4]
				vsaLen := attr.Attribute[5]
				if vsaType == 25 && int(vsaLen) <= len(attr.Attribute)-4 { // MS-CHAP2-Response
					return attr.Attribute[6 : 6+vsaLen-2]
				}
			}
		}
	}
	return nil
}

// verifyMSCHAP2 verifies MS-CHAPv2 authentication
func verifyMSCHAP2(username, password string, challenge, response []byte) (bool, []byte) {
	if len(response) < 50 {
		return false, nil
	}

	// MS-CHAPv2 Response format:
	// Ident (1) + Flags (1) + PeerChallenge (16) + Reserved (8) + NTResponse (24)
	peerChallenge := response[2:18]
	ntResponse := response[26:50]

	// Calculate expected NT Response
	expectedNT := generateNTResponse(challenge, peerChallenge, username, password)

	if !bytes.Equal(ntResponse, expectedNT) {
		return false, nil
	}

	// Generate authenticator response for MS-CHAP2-Success
	authResponse := generateAuthenticatorResponse(password, ntResponse, peerChallenge, challenge, username)

	// Build MS-CHAP2-Success (Ident + "S=" + 40 hex chars)
	ident := response[0]
	successStr := fmt.Sprintf("%c%s", ident, authResponse)

	return true, []byte(successStr)
}

// generateNTResponse generates the NT-Response for MS-CHAPv2
func generateNTResponse(authChallenge, peerChallenge []byte, username, password string) []byte {
	challenge := challengeHash(peerChallenge, authChallenge, username)
	passwordHash := ntPasswordHash(password)
	return challengeResponse(challenge, passwordHash)
}

// challengeHash creates the 8-byte challenge from peer and auth challenges
func challengeHash(peerChallenge, authChallenge []byte, username string) []byte {
	h := sha1.New()
	h.Write(peerChallenge)
	h.Write(authChallenge)
	h.Write([]byte(username))
	return h.Sum(nil)[:8]
}

// ntPasswordHash creates NT password hash using MD4
func ntPasswordHash(password string) []byte {
	// Convert password to UTF-16LE
	unicodePassword := make([]byte, len(password)*2)
	for i, r := range password {
		unicodePassword[i*2] = byte(r)
		unicodePassword[i*2+1] = byte(r >> 8)
	}

	h := md4.New()
	h.Write(unicodePassword)
	return h.Sum(nil)
}

// challengeResponse generates DES-encrypted response
func challengeResponse(challenge, passwordHash []byte) []byte {
	// Pad password hash to 21 bytes
	paddedHash := make([]byte, 21)
	copy(paddedHash, passwordHash)

	response := make([]byte, 24)
	desEncrypt(paddedHash[0:7], challenge, response[0:8])
	desEncrypt(paddedHash[7:14], challenge, response[8:16])
	desEncrypt(paddedHash[14:21], challenge, response[16:24])

	return response
}

// desEncrypt performs DES encryption for MS-CHAP
func desEncrypt(key, clear, cipher []byte) {
	// Expand 7-byte key to 8-byte DES key with parity bits
	desKey := make([]byte, 8)
	desKey[0] = key[0]
	desKey[1] = (key[0] << 7) | (key[1] >> 1)
	desKey[2] = (key[1] << 6) | (key[2] >> 2)
	desKey[3] = (key[2] << 5) | (key[3] >> 3)
	desKey[4] = (key[3] << 4) | (key[4] >> 4)
	desKey[5] = (key[4] << 3) | (key[5] >> 5)
	desKey[6] = (key[5] << 2) | (key[6] >> 6)
	desKey[7] = key[6] << 1

	// Set parity bits
	for i := range desKey {
		desKey[i] = setParityBit(desKey[i])
	}

	block, err := des.NewCipher(desKey)
	if err != nil {
		return
	}
	block.Encrypt(cipher, clear)
}

// setParityBit sets the parity bit for DES key byte
func setParityBit(b byte) byte {
	parity := byte(0)
	for i := 0; i < 7; i++ {
		parity ^= (b >> i) & 1
	}
	return (b & 0xFE) | (parity ^ 1)
}

// generateAuthenticatorResponse generates the authenticator response string
func generateAuthenticatorResponse(password string, ntResponse, peerChallenge, authChallenge []byte, username string) string {
	passwordHash := ntPasswordHash(password)
	passwordHashHash := md4Hash(passwordHash)

	h := sha1.New()
	h.Write(passwordHashHash)
	h.Write(ntResponse)
	h.Write([]byte("Magic server to client signing constant"))
	digest := h.Sum(nil)

	challenge := challengeHash(peerChallenge, authChallenge, username)

	h2 := sha1.New()
	h2.Write(digest)
	h2.Write(challenge)
	h2.Write([]byte("Pad to make it do more than one iteration"))
	finalDigest := h2.Sum(nil)

	return fmt.Sprintf("S=%X", finalDigest)
}

// md4Hash computes MD4 hash
func md4Hash(data []byte) []byte {
	h := md4.New()
	h.Write(data)
	return h.Sum(nil)
}

// buildMicrosoftVSA builds a Microsoft Vendor-Specific Attribute
func buildMicrosoftVSA(attrType byte, value []byte) []byte {
	// VSA format: Vendor-ID (4) + VSA-Type (1) + VSA-Length (1) + Value
	vsaLen := byte(len(value) + 2) // +2 for type and length bytes
	result := make([]byte, 4+2+len(value))

	// Microsoft Vendor ID = 311
	binary.BigEndian.PutUint32(result[0:4], 311)
	result[4] = attrType
	result[5] = vsaLen
	copy(result[6:], value)

	return result
}

// buildMikrotikVSA builds a Mikrotik Vendor-Specific Attribute
func buildMikrotikVSA(attrType byte, value []byte) []byte {
	// VSA format: Vendor-ID (4) + VSA-Type (1) + VSA-Length (1) + Value
	vsaLen := byte(len(value) + 2) // +2 for type and length bytes
	result := make([]byte, 4+2+len(value))

	// Mikrotik Vendor ID = 14988
	binary.BigEndian.PutUint32(result[0:4], 14988)
	result[4] = attrType
	result[5] = vsaLen
	copy(result[6:], value)

	return result
}
