package mikrotik

import (
	"crypto/md5"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"net"
	"strconv"
	"strings"
	"time"

	"github.com/proisp/backend/internal/database"
)

// Client represents a MikroTik RouterOS API client
type Client struct {
	Address  string
	Username string
	Password string
	conn     net.Conn
	timeout  time.Duration
}

// ConnectionResult contains the result of a connection test
type ConnectionResult struct {
	Success     bool
	IsOnline    bool
	APIAuth     bool
	ErrorMsg    string
	RouterInfo  map[string]string
}

// NewClient creates a new MikroTik client
func NewClient(address, username, password string) *Client {
	return &Client{
		Address:  address,
		Username: username,
		Password: password,
		timeout:  5 * time.Second,
	}
}

// TestConnection tests connectivity and authentication
func (c *Client) TestConnection() ConnectionResult {
	result := ConnectionResult{
		RouterInfo: make(map[string]string),
	}

	// Step 1: Check if port is reachable
	conn, err := net.DialTimeout("tcp", c.Address, c.timeout)
	if err != nil {
		result.ErrorMsg = fmt.Sprintf("Cannot reach router: %v", err)
		return result
	}
	defer conn.Close()

	result.IsOnline = true
	c.conn = conn
	conn.SetDeadline(time.Now().Add(c.timeout))

	// Step 2: Try to authenticate with RouterOS API
	// Send login command
	if err := c.sendWord("/login"); err != nil {
		result.ErrorMsg = fmt.Sprintf("Failed to send login: %v", err)
		return result
	}
	if err := c.sendWord("=name=" + c.Username); err != nil {
		result.ErrorMsg = fmt.Sprintf("Failed to send username: %v", err)
		return result
	}
	if err := c.sendWord("=password=" + c.Password); err != nil {
		result.ErrorMsg = fmt.Sprintf("Failed to send password: %v", err)
		return result
	}
	if err := c.sendWord(""); err != nil {
		result.ErrorMsg = fmt.Sprintf("Failed to send end: %v", err)
		return result
	}

	// Read response
	response, err := c.readResponse()
	if err != nil {
		result.ErrorMsg = fmt.Sprintf("Failed to read response: %v", err)
		return result
	}

	// Check if login was successful
	for _, word := range response {
		if word == "!done" {
			result.APIAuth = true
			result.Success = true
		}
		if strings.HasPrefix(word, "!trap") {
			result.ErrorMsg = "Authentication failed: Invalid username or password"
			return result
		}
		if strings.HasPrefix(word, "=ret=") {
			// Old style login - need challenge response
			challenge := strings.TrimPrefix(word, "=ret=")
			if err := c.challengeLogin(challenge); err != nil {
				result.ErrorMsg = fmt.Sprintf("Challenge login failed: %v", err)
				return result
			}
			result.APIAuth = true
			result.Success = true
		}
	}

	// If authenticated, try to get system identity
	if result.APIAuth {
		identity, err := c.getIdentity()
		if err == nil {
			result.RouterInfo["identity"] = identity
		}
	}

	return result
}

// challengeLogin performs the old-style MD5 challenge-response login
func (c *Client) challengeLogin(challenge string) error {
	// Decode challenge
	challengeBytes, err := hex.DecodeString(challenge)
	if err != nil {
		return err
	}

	// Create MD5 hash: 0x00 + password + challenge
	h := md5.New()
	h.Write([]byte{0})
	h.Write([]byte(c.Password))
	h.Write(challengeBytes)
	response := hex.EncodeToString(h.Sum(nil))

	// Send challenge response
	c.sendWord("/login")
	c.sendWord("=name=" + c.Username)
	c.sendWord("=response=00" + response)
	c.sendWord("")

	// Read response
	resp, err := c.readResponse()
	if err != nil {
		return err
	}

	for _, word := range resp {
		if word == "!done" {
			return nil
		}
		if strings.HasPrefix(word, "!trap") {
			return fmt.Errorf("authentication failed")
		}
	}

	return nil
}

// getIdentity retrieves the router's identity
func (c *Client) getIdentity() (string, error) {
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	c.sendWord("/system/identity/print")
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return "", err
	}

	for _, word := range response {
		if strings.HasPrefix(word, "=name=") {
			return strings.TrimPrefix(word, "=name="), nil
		}
	}

	return "", fmt.Errorf("identity not found")
}

// sendWord sends a word to the RouterOS API
func (c *Client) sendWord(word string) error {
	// Encode length
	length := len(word)
	var lenBytes []byte

	if length < 0x80 {
		lenBytes = []byte{byte(length)}
	} else if length < 0x4000 {
		lenBytes = []byte{byte((length >> 8) | 0x80), byte(length)}
	} else if length < 0x200000 {
		lenBytes = []byte{byte((length >> 16) | 0xC0), byte(length >> 8), byte(length)}
	} else if length < 0x10000000 {
		lenBytes = []byte{byte((length >> 24) | 0xE0), byte(length >> 16), byte(length >> 8), byte(length)}
	} else {
		lenBytes = []byte{0xF0, byte(length >> 24), byte(length >> 16), byte(length >> 8), byte(length)}
	}

	// Send length + word
	if _, err := c.conn.Write(lenBytes); err != nil {
		return err
	}
	if len(word) > 0 {
		if _, err := c.conn.Write([]byte(word)); err != nil {
			return err
		}
	}
	return nil
}

// readResponse reads a complete response from RouterOS
// Continues reading until !done is received
func (c *Client) readResponse() ([]string, error) {
	var words []string
	gotDone := false

	for {
		word, err := c.readWord()
		if err != nil {
			if err == io.EOF {
				break
			}
			return words, err
		}

		// Empty word means end of current sentence, but not end of response
		// Keep reading until we see !done
		if word == "" {
			if gotDone {
				break
			}
			continue
		}

		words = append(words, word)

		if word == "!done" {
			gotDone = true
		}
	}

	return words, nil
}

// readWord reads a single word from the connection
func (c *Client) readWord() (string, error) {
	// Read length
	length, err := c.readLength()
	if err != nil {
		return "", err
	}

	if length == 0 {
		return "", nil
	}

	// Read word
	word := make([]byte, length)
	_, err = io.ReadFull(c.conn, word)
	if err != nil {
		return "", err
	}

	return string(word), nil
}

// readLength reads the length encoding from RouterOS
func (c *Client) readLength() (int, error) {
	b := make([]byte, 1)
	_, err := c.conn.Read(b)
	if err != nil {
		return 0, err
	}

	first := b[0]

	if first < 0x80 {
		return int(first), nil
	} else if first < 0xC0 {
		_, err := c.conn.Read(b)
		if err != nil {
			return 0, err
		}
		return int(first&0x3F)<<8 | int(b[0]), nil
	} else if first < 0xE0 {
		extra := make([]byte, 2)
		_, err := io.ReadFull(c.conn, extra)
		if err != nil {
			return 0, err
		}
		return int(first&0x1F)<<16 | int(extra[0])<<8 | int(extra[1]), nil
	} else if first < 0xF0 {
		extra := make([]byte, 3)
		_, err := io.ReadFull(c.conn, extra)
		if err != nil {
			return 0, err
		}
		return int(first&0x0F)<<24 | int(extra[0])<<16 | int(extra[1])<<8 | int(extra[2]), nil
	} else {
		extra := make([]byte, 4)
		_, err := io.ReadFull(c.conn, extra)
		if err != nil {
			return 0, err
		}
		return int(extra[0])<<24 | int(extra[1])<<16 | int(extra[2])<<8 | int(extra[3]), nil
	}
}

// Close closes the connection
func (c *Client) Close() {
	if c.conn != nil {
		c.conn.Close()
	}
}

// RunCommand runs an arbitrary MikroTik command and returns the raw response
func (c *Client) RunCommand(command string) ([]map[string]string, error) {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}

	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// Send command
	if err := c.sendWord(command); err != nil {
		return nil, fmt.Errorf("failed to send command: %v", err)
	}
	if err := c.sendWord(""); err != nil {
		return nil, fmt.Errorf("failed to send end: %v", err)
	}

	// Read response
	response, err := c.readResponse()
	if err != nil {
		return nil, fmt.Errorf("failed to read response: %v", err)
	}

	// Parse response into map slices
	var results []map[string]string
	current := make(map[string]string)

	for _, word := range response {
		if word == "!re" {
			if len(current) > 0 {
				results = append(results, current)
				current = make(map[string]string)
			}
		} else if strings.HasPrefix(word, "=") {
			parts := strings.SplitN(word[1:], "=", 2)
			if len(parts) == 2 {
				current[parts[0]] = parts[1]
			} else if len(parts) == 1 {
				current[parts[0]] = ""
			}
		} else if word == "!done" {
			if len(current) > 0 {
				results = append(results, current)
			}
		}
	}

	return results, nil
}

// Connect establishes connection and authenticates
func (c *Client) Connect() error {
	conn, err := net.DialTimeout("tcp", c.Address, c.timeout)
	if err != nil {
		return fmt.Errorf("cannot connect: %v", err)
	}
	c.conn = conn
	conn.SetDeadline(time.Now().Add(c.timeout))

	// Send login
	c.sendWord("/login")
	c.sendWord("=name=" + c.Username)
	c.sendWord("=password=" + c.Password)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("login failed: %v", err)
	}

	for _, word := range response {
		if word == "!done" {
			return nil
		}
		if strings.HasPrefix(word, "=ret=") {
			// Old style login
			challenge := strings.TrimPrefix(word, "=ret=")
			return c.challengeLogin(challenge)
		}
		if strings.HasPrefix(word, "!trap") {
			return fmt.Errorf("authentication failed")
		}
	}
	return nil
}

// ActiveSession represents an active PPPoE session with bandwidth info
type ActiveSession struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Service    string `json:"service"`
	CallerID   string `json:"caller_id"`
	Address    string `json:"address"`
	Uptime     string `json:"uptime"`
	Encoding   string `json:"encoding"`
	SessionID  string `json:"session_id"`
	LimitBytesIn  int64 `json:"limit_bytes_in"`
	LimitBytesOut int64 `json:"limit_bytes_out"`
	RxBytes    int64  `json:"rx_bytes"`
	TxBytes    int64  `json:"tx_bytes"`
	RxRate     int64  `json:"rx_rate"`  // Current rx rate in bytes/sec
	TxRate     int64  `json:"tx_rate"`  // Current tx rate in bytes/sec
}

// GetActiveSession gets bandwidth info for an active PPPoE session
func (c *Client) GetActiveSession(username string) (*ActiveSession, error) {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// Query active PPP session
	c.sendWord("/ppp/active/print")
	c.sendWord("?name=" + username)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return nil, fmt.Errorf("failed to query session: %v", err)
	}

	session := &ActiveSession{}
	foundSession := false

	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			session.ID = strings.TrimPrefix(word, "=.id=")
			foundSession = true
		} else if strings.HasPrefix(word, "=name=") {
			session.Name = strings.TrimPrefix(word, "=name=")
		} else if strings.HasPrefix(word, "=service=") {
			session.Service = strings.TrimPrefix(word, "=service=")
		} else if strings.HasPrefix(word, "=caller-id=") {
			session.CallerID = strings.TrimPrefix(word, "=caller-id=")
		} else if strings.HasPrefix(word, "=address=") {
			session.Address = strings.TrimPrefix(word, "=address=")
		} else if strings.HasPrefix(word, "=uptime=") {
			session.Uptime = strings.TrimPrefix(word, "=uptime=")
		} else if strings.HasPrefix(word, "=session-id=") {
			session.SessionID = strings.TrimPrefix(word, "=session-id=")
		}
	}

	if !foundSession {
		return nil, fmt.Errorf("user not connected")
	}

	// Get session bytes from queue/simple (tracks total traffic)
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/queue/simple/print")
	c.sendWord("?target=" + session.Address + "/32")
	c.sendWord("")

	response, err = c.readResponse()
	if err == nil {
		for _, word := range response {
			// bytes format: "target-upload/target-download" where target is the client
			// So parts[0] = what client uploaded, parts[1] = what client downloaded
			if strings.HasPrefix(word, "=bytes=") {
				bytesStr := strings.TrimPrefix(word, "=bytes=")
				parts := strings.Split(bytesStr, "/")
				if len(parts) == 2 {
					session.TxBytes, _ = strconv.ParseInt(parts[1], 10, 64) // upload (client sends) - second value
					session.RxBytes, _ = strconv.ParseInt(parts[0], 10, 64) // download (client receives) - first value
				}
			}
		}
	}

	// Fallback: try interface stats
	if session.RxBytes == 0 && session.TxBytes == 0 {
		interfaceName := "<pppoe-" + username + ">"
		c.conn.SetDeadline(time.Now().Add(c.timeout))
		c.sendWord("/interface/print")
		c.sendWord("?name=" + interfaceName)
		c.sendWord("")

		response, err = c.readResponse()
		if err == nil {
			for _, word := range response {
				if strings.HasPrefix(word, "=rx-byte=") {
					val := strings.TrimPrefix(word, "=rx-byte=")
					session.RxBytes, _ = strconv.ParseInt(val, 10, 64)
				} else if strings.HasPrefix(word, "=tx-byte=") {
					val := strings.TrimPrefix(word, "=tx-byte=")
					session.TxBytes, _ = strconv.ParseInt(val, 10, 64)
				}
			}
		}
	}

	// Try different interface name formats for PPPoE
	interfaceNames := []string{
		"<pppoe-" + username + ">",
		"pppoe-" + username,
		username,
	}

	for _, interfaceName := range interfaceNames {
		// Get real-time traffic using /interface/monitor-traffic (single sample)
		c.conn.SetDeadline(time.Now().Add(c.timeout))
		c.sendWord("/interface/monitor-traffic")
		c.sendWord("=interface=" + interfaceName)
		c.sendWord("=once=")
		c.sendWord("")

		response, err = c.readResponse()
		if err == nil {
			for _, word := range response {
				if strings.HasPrefix(word, "=rx-bits-per-second=") {
					val := strings.TrimPrefix(word, "=rx-bits-per-second=")
					bits, _ := strconv.ParseInt(val, 10, 64)
					session.RxRate = bits / 8 // Convert to bytes/sec
					log.Printf("Found traffic on interface %s: rx=%d bits/sec", interfaceName, bits)
				} else if strings.HasPrefix(word, "=tx-bits-per-second=") {
					val := strings.TrimPrefix(word, "=tx-bits-per-second=")
					bits, _ := strconv.ParseInt(val, 10, 64)
					session.TxRate = bits / 8 // Convert to bytes/sec
					log.Printf("Found traffic on interface %s: tx=%d bits/sec", interfaceName, bits)
				}
			}
			// If we got real data, stop trying other names
			if session.RxRate > 0 || session.TxRate > 0 {
				break
			}
		}
	}

	// If still no rate data, try to get from queue rate
	if session.RxRate == 0 && session.TxRate == 0 && session.Address != "" {
		c.conn.SetDeadline(time.Now().Add(c.timeout))
		c.sendWord("/queue/simple/print")
		c.sendWord("?target=" + session.Address + "/32")
		c.sendWord("")

		response, err = c.readResponse()
		if err == nil {
			for _, word := range response {
				// rate format: "upload/download" in bits per second
				// upload = user sends = router receives, download = user gets = router transmits
				if strings.HasPrefix(word, "=rate=") {
					rateStr := strings.TrimPrefix(word, "=rate=")
					parts := strings.Split(rateStr, "/")
					if len(parts) == 2 {
						uploadBits, _ := strconv.ParseInt(parts[0], 10, 64)
						downloadBits, _ := strconv.ParseInt(parts[1], 10, 64)
						// Match interface convention: Rx=upload (received from user), Tx=download (sent to user)
						session.RxRate = uploadBits / 8   // user upload rate
						session.TxRate = downloadBits / 8 // user download rate
						log.Printf("Got rate from queue for %s: upload=%d download=%d bits/sec", username, uploadBits, downloadBits)
					}
				}
			}
		}
	}

	return session, nil
}

// DisconnectUser disconnects a PPPoE user by username
func (c *Client) DisconnectUser(username string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// Find active PPPoE session
	c.sendWord("/ppp/active/print")
	c.sendWord("?name=" + username)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to find session: %v", err)
	}

	// Extract session ID
	var sessionID string
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			sessionID = strings.TrimPrefix(word, "=.id=")
			break
		}
	}

	if sessionID == "" {
		return fmt.Errorf("user not connected")
	}

	// Remove the session
	c.sendWord("/ppp/active/remove")
	c.sendWord("=.id=" + sessionID)
	c.sendWord("")

	response, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to disconnect: %v", err)
	}

	for _, word := range response {
		if strings.HasPrefix(word, "!trap") {
			return fmt.Errorf("disconnect failed")
		}
	}

	return nil
}

// UpdateUserRateLimit updates the rate limit for a PPPoE user
// downloadKbps and uploadKbps are in Kilobits per second (e.g., 700 = 700k)
// Updates the existing PPPoE queue created by RADIUS
func (c *Client) UpdateUserRateLimit(username string, downloadKbps, uploadKbps int) error {
	return c.UpdateUserRateLimitWithIP(username, "", downloadKbps, uploadKbps)
}

// UpdateUserRateLimitWithIP updates the rate limit for a PPPoE user
// Searches by interface name (<pppoe-username>) or IP address
func (c *Client) UpdateUserRateLimitWithIP(username, ipAddress string, downloadKbps, uploadKbps int) error {
	log.Printf("MikroTik: UpdateUserRateLimitWithIP called for %s, IP=%s, rate=%dk/%dk", username, ipAddress, downloadKbps, uploadKbps)

	// Reuse existing connection if available, only connect if needed
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			log.Printf("MikroTik: Connect failed: %v", err)
			return err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// PPPoE queues can have target as:
	// 1. Interface name like "<pppoe-username>"
	// 2. IP address like "10.11.0.20/32"
	interfaceTarget := "<pppoe-" + username + ">"
	ipTarget := ""
	if ipAddress != "" {
		ipTarget = ipAddress + "/32"
	}

	// List all queues and find the one matching our target
	c.sendWord("/queue/simple/print")
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to list queues: %v", err)
	}

	// Parse response to find queue with matching target or name
	// We need to find the main PPPoE queue, not CDN queues (which have dst= set)
	var queueID string

	// First pass: collect all queue info
	type queueInfo struct {
		id     string
		name   string
		target string
		dst    string
	}
	var queues []queueInfo
	var current queueInfo

	for _, word := range response {
		if word == "!re" {
			// New queue entry - save previous if exists
			if current.id != "" {
				queues = append(queues, current)
			}
			current = queueInfo{}
		}
		if strings.HasPrefix(word, "=.id=") {
			current.id = strings.TrimPrefix(word, "=.id=")
		}
		if strings.HasPrefix(word, "=name=") {
			current.name = strings.TrimPrefix(word, "=name=")
		}
		if strings.HasPrefix(word, "=target=") {
			current.target = strings.TrimPrefix(word, "=target=")
		}
		if strings.HasPrefix(word, "=dst=") {
			current.dst = strings.TrimPrefix(word, "=dst=")
		}
	}
	// Don't forget last queue
	if current.id != "" {
		queues = append(queues, current)
	}

	// Find the main PPPoE queue (matches target but has NO dst - not a CDN queue)
	for _, q := range queues {
		// Skip CDN queues (they have dst set)
		if q.dst != "" {
			continue
		}
		// Match by name (exact interface name) or by target
		if q.name == interfaceTarget || q.target == interfaceTarget || (ipTarget != "" && q.target == ipTarget) {
			queueID = q.id
			log.Printf("MikroTik: Found main queue %s (name=%s, target=%s) for user %s", q.id, q.name, q.target, username)
			break
		}
	}

	// Format rate limit: "upload/download" in Kbps (e.g., "700k/700k")
	maxLimit := fmt.Sprintf("%dk/%dk", uploadKbps, downloadKbps)

	if queueID == "" {
		log.Printf("MikroTik: Queue not found for user %s (interface=%s, ip=%s)", username, interfaceTarget, ipTarget)
		return fmt.Errorf("queue not found for user %s", username)
	}
	log.Printf("MikroTik: Found queue %s for user %s, setting max-limit=%s", queueID, username, maxLimit)

	// Try to update existing queue
	c.sendWord("/queue/simple/set")
	c.sendWord("=.id=" + queueID)
	c.sendWord("=max-limit=" + maxLimit)
	c.sendWord("")

	response, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to update rate limit: %v", err)
	}
	log.Printf("MikroTik: Queue set response: %v", response)

	for _, word := range response {
		if strings.HasPrefix(word, "!trap") {
			// Check for "can't edit dynamic object" error
			for _, w := range response {
				if strings.HasPrefix(w, "=message=") {
					errMsg := strings.TrimPrefix(w, "=message=")
					log.Printf("MikroTik: Queue update error: %s", errMsg)
					if strings.Contains(errMsg, "dynamic") {
						// Dynamic queue - try to update via PPP secret instead
						log.Printf("MikroTik: Dynamic queue detected, trying PPP secret")
						return c.updatePPPRateLimit(username, maxLimit)
					}
					return fmt.Errorf("rate limit update failed: %s", errMsg)
				}
			}
			return fmt.Errorf("rate limit update failed")
		}
	}

	log.Printf("MikroTik: Queue update successful for %s to %s", username, maxLimit)
	return nil
}

// updatePPPRateLimit updates rate limit for a PPPoE user via PPP secret
func (c *Client) updatePPPRateLimit(username, rateLimit string) error {
	// Update the PPP secret's rate-limit, which will take effect after the dynamic queue is recreated
	// First check if secret exists
	c.sendWord("/ppp/secret/print")
	c.sendWord("?name=" + username)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to query PPP secret: %v", err)
	}

	var secretID string
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			secretID = strings.TrimPrefix(word, "=.id=")
			break
		}
	}

	if secretID == "" {
		// No local secret - user authenticates via RADIUS
		// Return error so caller can send CoA first, then call RemoveDynamicQueueForRecreation
		log.Printf("MikroTik: RADIUS user - no local PPP secret, CoA required to update session rate-limit")
		return fmt.Errorf("RADIUS user - CoA required first")
	}

	// Update rate limit on the PPP secret
	c.sendWord("/ppp/secret/set")
	c.sendWord("=.id=" + secretID)
	c.sendWord("=rate-limit=" + rateLimit)
	c.sendWord("")

	response, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to set PPP secret rate limit: %v", err)
	}

	for _, word := range response {
		if strings.HasPrefix(word, "!trap") {
			for _, w := range response {
				if strings.HasPrefix(w, "=message=") {
					return fmt.Errorf("PPP secret rate limit update failed: %s", strings.TrimPrefix(w, "=message="))
				}
			}
			return fmt.Errorf("PPP secret rate limit update failed")
		}
	}

	// PPP secret updated, active session will get new rate on reconnect
	return nil
}

// RemoveDynamicQueueForRecreation removes the dynamic queue for a RADIUS user
// MikroTik will automatically recreate it with the rate-limit from the session
// This should be called AFTER CoA updates the session's rate-limit attribute
func (c *Client) RemoveDynamicQueueForRecreation(username string) error {
	interfaceTarget := "<pppoe-" + username + ">"

	// Find the dynamic queue
	c.sendWord("/queue/simple/print")
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to list queues: %v", err)
	}

	// Parse to find the dynamic queue (one without dst=, matching target)
	type queueInfo struct {
		id     string
		name   string
		target string
		dst    string
	}
	var queues []queueInfo
	var current queueInfo

	for _, word := range response {
		if word == "!re" {
			if current.id != "" {
				queues = append(queues, current)
			}
			current = queueInfo{}
		}
		if strings.HasPrefix(word, "=.id=") {
			current.id = strings.TrimPrefix(word, "=.id=")
		}
		if strings.HasPrefix(word, "=name=") {
			current.name = strings.TrimPrefix(word, "=name=")
		}
		if strings.HasPrefix(word, "=target=") {
			current.target = strings.TrimPrefix(word, "=target=")
		}
		if strings.HasPrefix(word, "=dst=") {
			current.dst = strings.TrimPrefix(word, "=dst=")
		}
	}
	if current.id != "" {
		queues = append(queues, current)
	}

	// Find the main dynamic queue (no dst, matches target)
	var queueID string
	for _, q := range queues {
		if q.dst != "" {
			continue // Skip CDN queues
		}
		if q.name == interfaceTarget || q.target == interfaceTarget {
			queueID = q.id
			log.Printf("MikroTik: Found dynamic queue %s (name=%s) to remove for recreation", q.id, q.name)
			break
		}
	}

	if queueID == "" {
		return fmt.Errorf("dynamic queue not found for user %s", username)
	}

	// Remove the queue - MikroTik will recreate it with new rate from session
	c.sendWord("/queue/simple/remove")
	c.sendWord("=.id=" + queueID)
	c.sendWord("")

	response, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to remove queue: %v", err)
	}

	for _, word := range response {
		if strings.HasPrefix(word, "!trap") {
			for _, w := range response {
				if strings.HasPrefix(w, "=message=") {
					errMsg := strings.TrimPrefix(w, "=message=")
					return fmt.Errorf("failed to remove queue: %s", errMsg)
				}
			}
			return fmt.Errorf("failed to remove queue")
		}
	}

	log.Printf("MikroTik: Removed dynamic queue for %s - MikroTik should recreate with new rate", username)
	return nil
}

// RemoveUserQueue restores the original speed for a user (when FUP is reset)
// This updates the PPPoE queue back to the original RADIUS speed
func (c *Client) RemoveUserQueue(username string) error {
	// This function now just logs that FUP was reset
	// The actual speed restoration happens via RADIUS when user reconnects
	// or via UpdateUserRateLimit with the original speed
	log.Printf("MikroTik: FUP reset for %s - speed will be restored from RADIUS on reconnect", username)
	return nil
}

// RestoreUserSpeed restores the original speed for a user
// downloadMbps and uploadMbps are in Megabits per second (from service)
func (c *Client) RestoreUserSpeed(username string, downloadMbps, uploadMbps int64) error {
	// Convert Mbps to Kbps for the API
	return c.UpdateUserRateLimit(username, int(downloadMbps*1000), int(uploadMbps*1000))
}

// RestoreUserSpeedWithIP restores the original speed for a user using IP for queue lookup
func (c *Client) RestoreUserSpeedWithIP(username, ipAddress string, downloadMbps, uploadMbps int64) error {
	// Convert Mbps to Kbps for the API
	return c.UpdateUserRateLimitWithIP(username, ipAddress, int(downloadMbps*1000), int(uploadMbps*1000))
}

// GetConnectionCount returns the number of active connections for an IP address
// This queries the connection tracking table
func (c *Client) GetConnectionCount(ipAddress string) (int, error) {
	if ipAddress == "" {
		return 0, fmt.Errorf("IP address is required")
	}

	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return 0, err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// Query connection tracking for this IP
	c.sendWord("/ip/firewall/connection/print")
	c.sendWord("?src-address=" + ipAddress)
	c.sendWord("=count-only=")
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return 0, fmt.Errorf("failed to query connections: %v", err)
	}

	// Parse count from response
	count := 0
	for _, word := range response {
		if strings.HasPrefix(word, "=ret=") {
			countStr := strings.TrimPrefix(word, "=ret=")
			count, _ = strconv.Atoi(countStr)
			break
		}
	}

	return count, nil
}

// GetTTLValues samples TTL values from recent connections for an IP
// Returns unique TTL values seen for this source IP
func (c *Client) GetTTLValues(ipAddress string) ([]int, error) {
	if ipAddress == "" {
		return nil, fmt.Errorf("IP address is required")
	}

	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2)) // Longer timeout for this query

	// We need to get TTL from firewall mangle rules or torch
	// First, check if there's a mangle rule tracking TTL
	// If not, we'll try to get a sample from torch

	// Method 1: Check for marked connections with TTL info
	// This requires pre-configured mangle rules

	// Method 2: Use torch to sample packets (less reliable but works without config)
	// Torch shows real-time traffic including TTL

	// For now, let's query the connection table and see if we can get any TTL info
	// MikroTik connection table doesn't store TTL directly, so we'll need mangle rules

	// Fallback: Return empty if no TTL tracking is configured
	// In production, you'd want to add mangle rules to track TTL

	ttlValues := []int{}

	// Try to get from existing connections with reply-src-address
	// This is a workaround - real TTL detection needs mangle rules
	c.sendWord("/ip/firewall/connection/print")
	c.sendWord("?src-address=" + ipAddress)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return ttlValues, nil // Return empty on error
	}

	// Count connections to estimate if there might be sharing
	// Different reply-dst-address values might indicate different destinations
	connectionCount := 0
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			connectionCount++
		}
	}

	// Heuristic: if many connections, try to detect TTL via mangle marks
	// Check for TTL-marked connections
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/connection/print")
	c.sendWord("?src-address=" + ipAddress)
	c.sendWord("?connection-mark=ttl_127")
	c.sendWord("=count-only=")
	c.sendWord("")

	response, err = c.readResponse()
	if err == nil {
		for _, word := range response {
			if strings.HasPrefix(word, "=ret=") {
				countStr := strings.TrimPrefix(word, "=ret=")
				count, _ := strconv.Atoi(countStr)
				if count > 0 {
					ttlValues = append(ttlValues, 127)
				}
				break
			}
		}
	}

	// Check for TTL=63 marked connections
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/connection/print")
	c.sendWord("?src-address=" + ipAddress)
	c.sendWord("?connection-mark=ttl_63")
	c.sendWord("=count-only=")
	c.sendWord("")

	response, err = c.readResponse()
	if err == nil {
		for _, word := range response {
			if strings.HasPrefix(word, "=ret=") {
				countStr := strings.TrimPrefix(word, "=ret=")
				count, _ := strconv.Atoi(countStr)
				if count > 0 {
					ttlValues = append(ttlValues, 63)
				}
				break
			}
		}
	}

	// Check for TTL=128 marked connections (normal Windows)
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/connection/print")
	c.sendWord("?src-address=" + ipAddress)
	c.sendWord("?connection-mark=ttl_128")
	c.sendWord("=count-only=")
	c.sendWord("")

	response, err = c.readResponse()
	if err == nil {
		for _, word := range response {
			if strings.HasPrefix(word, "=ret=") {
				countStr := strings.TrimPrefix(word, "=ret=")
				count, _ := strconv.Atoi(countStr)
				if count > 0 {
					ttlValues = append(ttlValues, 128)
				}
				break
			}
		}
	}

	// Check for TTL=64 marked connections (normal Linux/Android)
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/connection/print")
	c.sendWord("?src-address=" + ipAddress)
	c.sendWord("?connection-mark=ttl_64")
	c.sendWord("=count-only=")
	c.sendWord("")

	response, err = c.readResponse()
	if err == nil {
		for _, word := range response {
			if strings.HasPrefix(word, "=ret=") {
				countStr := strings.TrimPrefix(word, "=ret=")
				count, _ := strconv.Atoi(countStr)
				if count > 0 {
					ttlValues = append(ttlValues, 64)
				}
				break
			}
		}
	}

	return ttlValues, nil
}

// CDNTraffic represents traffic from a specific source IP range
type CDNTraffic struct {
	SourceIP string `json:"source_ip"`
	Bytes    int64  `json:"bytes"`
	Packets  int64  `json:"packets"`
}

// GetTrafficBySourceIP returns traffic data grouped by source IP for a given destination IP (subscriber)
// This requires IP accounting to be enabled on MikroTik (/ip/accounting)
// Returns traffic from sources TO the subscriber (download direction)
func (c *Client) GetTrafficBySourceIP(subscriberIP string) ([]CDNTraffic, error) {
	if subscriberIP == "" {
		return nil, fmt.Errorf("subscriber IP is required")
	}

	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout * 3))

	// First, take a snapshot of accounting data
	c.sendWord("/ip/accounting/snapshot/take")
	c.sendWord("")

	_, err := c.readResponse()
	if err != nil {
		// Snapshot might already exist or accounting not enabled
		log.Printf("MikroTik: IP accounting snapshot take: %v", err)
	}

	// Query accounting snapshot for traffic TO the subscriber IP (download traffic)
	c.conn.SetDeadline(time.Now().Add(c.timeout * 3))
	c.sendWord("/ip/accounting/snapshot/print")
	c.sendWord("?dst-address=" + subscriberIP)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return nil, fmt.Errorf("failed to query accounting: %v", err)
	}

	var results []CDNTraffic
	currentTraffic := CDNTraffic{}

	for _, word := range response {
		if word == "!re" {
			if currentTraffic.SourceIP != "" {
				results = append(results, currentTraffic)
			}
			currentTraffic = CDNTraffic{}
		} else if strings.HasPrefix(word, "=src-address=") {
			currentTraffic.SourceIP = strings.TrimPrefix(word, "=src-address=")
		} else if strings.HasPrefix(word, "=bytes=") {
			val := strings.TrimPrefix(word, "=bytes=")
			currentTraffic.Bytes, _ = strconv.ParseInt(val, 10, 64)
		} else if strings.HasPrefix(word, "=packets=") {
			val := strings.TrimPrefix(word, "=packets=")
			currentTraffic.Packets, _ = strconv.ParseInt(val, 10, 64)
		}
	}

	// Don't forget the last entry
	if currentTraffic.SourceIP != "" {
		results = append(results, currentTraffic)
	}

	return results, nil
}

// GetConnectionDetails returns detailed connection info for an IP
func (c *Client) GetConnectionDetails(ipAddress string) ([]map[string]string, error) {
	if ipAddress == "" {
		return nil, fmt.Errorf("IP address is required")
	}

	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))

	// Query connections - limit to first 50 for performance
	c.sendWord("/ip/firewall/connection/print")
	c.sendWord("?src-address=" + ipAddress)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return nil, fmt.Errorf("failed to query connections: %v", err)
	}

	var connections []map[string]string
	currentConn := make(map[string]string)
	count := 0
	maxConnections := 50

	for _, word := range response {
		if word == "!re" {
			if len(currentConn) > 0 && count < maxConnections {
				connections = append(connections, currentConn)
				count++
			}
			currentConn = make(map[string]string)
		} else if strings.HasPrefix(word, "=") {
			parts := strings.SplitN(word[1:], "=", 2)
			if len(parts) == 2 {
				currentConn[parts[0]] = parts[1]
			}
		}
	}

	// Don't forget the last connection
	if len(currentConn) > 0 && count < maxConnections {
		connections = append(connections, currentConn)
	}

	return connections, nil
}

// CDNConfig represents a CDN configuration for MikroTik sync
type CDNConfig struct {
	ID          uint
	Name        string
	Subnets     []string // List of CIDR subnets
	CompanyName string   // Company name for branding in comments
}

// SyncCDNAddressList creates or updates an address-list for a CDN on MikroTik
func (c *Client) SyncCDNAddressList(cdn CDNConfig) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	// Use company name for branding in comments
	companyName := cdn.CompanyName
	if companyName == "" {
		companyName = database.GetCompanyName()
	}
	if companyName == "" {
		companyName = "ISP"
	}

	listName := fmt.Sprintf("CDN-%s", cdn.Name)

	// First, remove existing entries for this CDN list
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
	c.sendWord("/ip/firewall/address-list/print")
	c.sendWord("?list=" + listName)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		log.Printf("MikroTik: Failed to query address-list: %v", err)
	}

	// Collect existing entry IDs to remove
	var existingIDs []string
	currentID := ""
	for _, word := range response {
		if word == "!re" {
			if currentID != "" {
				existingIDs = append(existingIDs, currentID)
			}
			currentID = ""
		} else if strings.HasPrefix(word, "=.id=") {
			currentID = strings.TrimPrefix(word, "=.id=")
		}
	}
	if currentID != "" {
		existingIDs = append(existingIDs, currentID)
	}

	// Remove existing entries
	for _, id := range existingIDs {
		c.conn.SetDeadline(time.Now().Add(c.timeout))
		c.sendWord("/ip/firewall/address-list/remove")
		c.sendWord("=.id=" + id)
		c.sendWord("")
		c.readResponse() // Ignore errors
	}

	// Add new entries for each subnet
	addedCount := 0
	for _, subnet := range cdn.Subnets {
		subnet = strings.TrimSpace(subnet)
		// Also remove any newlines that might be in the subnet
		subnet = strings.ReplaceAll(subnet, "\n", "")
		subnet = strings.ReplaceAll(subnet, "\r", "")
		if subnet == "" {
			continue
		}

		c.conn.SetDeadline(time.Now().Add(c.timeout))
		c.sendWord("/ip/firewall/address-list/add")
		c.sendWord("=list=" + listName)
		c.sendWord("=address=" + subnet)
		c.sendWord("=comment=" + companyName + "-CDN-" + cdn.Name)
		c.sendWord("")

		response, err := c.readResponse()
		if err != nil {
			log.Printf("MikroTik: Failed to add address-list entry %s: %v", subnet, err)
		} else {
			// Check for trap (error) in response
			hasError := false
			for _, word := range response {
				if strings.HasPrefix(word, "!trap") {
					hasError = true
					log.Printf("MikroTik: Error adding address-list entry %s: %v", subnet, response)
					break
				}
			}
			if !hasError {
				addedCount++
				log.Printf("MikroTik: Added address-list entry: list=%s address=%s", listName, subnet)
			}
		}
	}

	log.Printf("MikroTik: Synced CDN address-list %s with %d subnets (added %d entries)", listName, len(cdn.Subnets), addedCount)
	return nil
}

// SyncCDNMangleRule creates or updates a mangle rule to count CDN traffic
func (c *Client) SyncCDNMangleRule(cdn CDNConfig) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	// Use company name for branding in comments
	companyName := cdn.CompanyName
	if companyName == "" {
		companyName = database.GetCompanyName()
	}
	if companyName == "" {
		companyName = "ISP"
	}

	listName := fmt.Sprintf("CDN-%s", cdn.Name)
	comment := fmt.Sprintf("%s-CDN-%s-counter", companyName, cdn.Name)

	// Check if mangle rule already exists
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
	c.sendWord("/ip/firewall/mangle/print")
	c.sendWord("?comment=" + comment)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to query mangle rules: %v", err)
	}

	// Check if rule exists
	ruleExists := false
	for _, word := range response {
		if word == "!re" {
			ruleExists = true
			break
		}
	}

	if !ruleExists {
		// Create new mangle rule
		c.conn.SetDeadline(time.Now().Add(c.timeout))
		c.sendWord("/ip/firewall/mangle/add")
		c.sendWord("=chain=forward")
		c.sendWord("=src-address-list=" + listName)
		c.sendWord("=action=passthrough")
		c.sendWord("=comment=" + comment)
		c.sendWord("")

		_, err := c.readResponse()
		if err != nil {
			return fmt.Errorf("failed to create mangle rule: %v", err)
		}
		log.Printf("MikroTik: Created mangle rule for CDN %s", cdn.Name)
	}

	return nil
}

// CDNTrafficCounter holds traffic counters for a CDN
type CDNTrafficCounter struct {
	CDNID   uint
	CDNName string
	Bytes   int64
	Packets int64
}

// GetCDNTrafficCounters retrieves traffic counters from mangle rules for all CDNs
func (c *Client) GetCDNTrafficCounters(cdnNames []string, companyName string) ([]CDNTrafficCounter, error) {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}

	// Use company name for branding in comments
	if companyName == "" {
		companyName = database.GetCompanyName()
	}
	if companyName == "" {
		companyName = "ISP"
	}

	var results []CDNTrafficCounter

	for _, cdnName := range cdnNames {
		comment := fmt.Sprintf("%s-CDN-%s-counter", companyName, cdnName)

		c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
		c.sendWord("/ip/firewall/mangle/print")
		c.sendWord("?comment=" + comment)
		c.sendWord("")

		response, err := c.readResponse()
		if err != nil {
			log.Printf("MikroTik: Failed to get mangle counters for %s: %v", cdnName, err)
			continue
		}

		counter := CDNTrafficCounter{CDNName: cdnName}
		for _, word := range response {
			if strings.HasPrefix(word, "=bytes=") {
				val := strings.TrimPrefix(word, "=bytes=")
				counter.Bytes, _ = strconv.ParseInt(val, 10, 64)
			} else if strings.HasPrefix(word, "=packets=") {
				val := strings.TrimPrefix(word, "=packets=")
				counter.Packets, _ = strconv.ParseInt(val, 10, 64)
			}
		}

		results = append(results, counter)
	}

	return results, nil
}

// CDNSubnetConfig holds CDN info with subnets for traffic matching
type CDNSubnetConfig struct {
	ID      uint
	Name    string
	Subnets string // Comma/newline separated CIDR subnets
}

// GetCDNTrafficForSubscriber gets CDN traffic counters for a specific subscriber
// Queries connection tracking and matches source IPs against provided CDN subnets
// NO MikroTik configuration required - just reads connection table
func (c *Client) GetCDNTrafficForSubscriber(subscriberIP string, cdns []CDNSubnetConfig) ([]CDNTrafficCounter, error) {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}

	// Query connection tracking - get connections where dst-address contains subscriber IP
	// MikroTik stores dst-address with port like "14.12.12.12:443"
	c.conn.SetDeadline(time.Now().Add(c.timeout * 10))
	c.sendWord("/ip/firewall/connection/print")
	c.sendWord("=.proplist=src-address,dst-address,orig-bytes,repl-bytes")
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return nil, fmt.Errorf("failed to get connections: %v", err)
	}

	log.Printf("CDN Traffic Debug: Got %d words from connection table", len(response))

	// Parse all connections and filter by subscriber IP
	type connData struct {
		srcIP     string
		dstIP     string
		origBytes int64
		replBytes int64
	}
	var allConnections []connData
	current := connData{}

	for _, word := range response {
		if word == "!re" {
			if current.srcIP != "" {
				allConnections = append(allConnections, current)
			}
			current = connData{}
		} else if strings.HasPrefix(word, "=src-address=") {
			current.srcIP = strings.TrimPrefix(word, "=src-address=")
			// Remove port if present
			if idx := strings.Index(current.srcIP, ":"); idx > 0 {
				current.srcIP = current.srcIP[:idx]
			}
		} else if strings.HasPrefix(word, "=dst-address=") {
			current.dstIP = strings.TrimPrefix(word, "=dst-address=")
			// Remove port if present
			if idx := strings.Index(current.dstIP, ":"); idx > 0 {
				current.dstIP = current.dstIP[:idx]
			}
		} else if strings.HasPrefix(word, "=orig-bytes=") {
			val := strings.TrimPrefix(word, "=orig-bytes=")
			current.origBytes, _ = strconv.ParseInt(val, 10, 64)
		} else if strings.HasPrefix(word, "=repl-bytes=") {
			val := strings.TrimPrefix(word, "=repl-bytes=")
			current.replBytes, _ = strconv.ParseInt(val, 10, 64)
		}
	}
	// Don't forget last entry
	if current.srcIP != "" {
		allConnections = append(allConnections, current)
	}

	// Filter connections for this subscriber (check both src and dst)
	var connections []connData
	for _, conn := range allConnections {
		if conn.dstIP == subscriberIP || conn.srcIP == subscriberIP {
			connections = append(connections, conn)
		}
	}

	log.Printf("CDN Traffic: Found %d total connections, %d for subscriber %s", len(allConnections), len(connections), subscriberIP)

	// Debug: show subscriber's connections with remote IPs
	if len(connections) > 0 {
		seenIPs := make(map[string]bool)
		log.Printf("CDN Traffic Debug: Subscriber connections:")
		for _, conn := range connections {
			// Find the remote IP (the one that's NOT the subscriber)
			remoteIP := conn.dstIP
			direction := "OUT"
			bytes := conn.replBytes // repl-bytes = response bytes = download for subscriber
			if conn.srcIP != subscriberIP {
				remoteIP = conn.srcIP
				direction = "IN"
				bytes = conn.origBytes
			}
			if !seenIPs[remoteIP] && len(seenIPs) < 10 {
				seenIPs[remoteIP] = true
				log.Printf("CDN Traffic Debug:   %s remote=%s bytes=%d", direction, remoteIP, bytes)
			}
		}
	}

	// Match connections against each CDN's subnets
	var results []CDNTrafficCounter
	for _, cdn := range cdns {
		var totalBytes int64
		subnets := parseSubnetList(cdn.Subnets)
		log.Printf("CDN Traffic Debug: CDN %s has %d subnets: %v", cdn.Name, len(subnets), subnets)

		for _, conn := range connections {
			// Determine remote IP and download bytes based on direction
			var remoteIP string
			var downloadBytes int64

			if conn.srcIP == subscriberIP {
				// Outbound connection: subscriber -> remote
				// dstIP is the remote server (check if it's CDN)
				// repl-bytes = bytes coming back = download
				remoteIP = conn.dstIP
				downloadBytes = conn.replBytes
			} else {
				// Inbound connection: remote -> subscriber
				// srcIP is the remote server (check if it's CDN)
				// orig-bytes = bytes from source = download
				remoteIP = conn.srcIP
				downloadBytes = conn.origBytes
			}

			// Check if remote IP matches CDN subnet
			for _, subnet := range subnets {
				matched := isIPInCIDR(remoteIP, subnet)
				if matched {
					totalBytes += downloadBytes
					log.Printf("CDN Traffic: remote=%s matched CDN %s subnet %s, download=%d bytes", remoteIP, cdn.Name, subnet, downloadBytes)
					break
				}
			}
		}

		results = append(results, CDNTrafficCounter{
			CDNID:   cdn.ID,
			CDNName: cdn.Name,
			Bytes:   totalBytes,
		})
	}

	return results, nil
}

// parseSubnetList splits subnet string into slice
func parseSubnetList(subnets string) []string {
	var result []string
	for _, s := range strings.FieldsFunc(subnets, func(r rune) bool {
		return r == ',' || r == '\n' || r == ';' || r == ' '
	}) {
		s = strings.TrimSpace(s)
		if s != "" {
			result = append(result, s)
		}
	}
	return result
}

// isIPInAddressList checks if an IP belongs to a MikroTik address list
func (c *Client) isIPInAddressList(ip, listName string) bool {
	// Query address list
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/address-list/print")
	c.sendWord("?list=" + listName)
	c.sendWord("")

	response, _ := c.readResponse()

	// Parse subnets from address list
	for _, word := range response {
		if strings.HasPrefix(word, "=address=") {
			subnet := strings.TrimPrefix(word, "=address=")
			if isIPInCIDR(ip, subnet) {
				return true
			}
		}
	}

	return false
}

// isIPInCIDR checks if an IP is within a CIDR range
func isIPInCIDR(ipStr, cidr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		log.Printf("CDN Match Debug: Failed to parse IP: %s", ipStr)
		return false
	}

	_, network, err := net.ParseCIDR(cidr)
	if err != nil {
		log.Printf("CDN Match Debug: Failed to parse CIDR %s: %v, trying exact match", cidr, err)
		// Try as single IP
		if cidr == ipStr {
			return true
		}
		return false
	}

	result := network.Contains(ip)
	if result {
		log.Printf("CDN Match Debug: IP %s IS in CIDR %s", ipStr, cidr)
	}
	return result
}

// RemoveCDNConfig removes CDN address-list and mangle rule from MikroTik
func (c *Client) RemoveCDNConfig(cdnName string, companyName string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	// Use company name for branding in comments
	if companyName == "" {
		companyName = database.GetCompanyName()
	}
	if companyName == "" {
		companyName = "ISP"
	}

	listName := fmt.Sprintf("CDN-%s", cdnName)
	comment := fmt.Sprintf("%s-CDN-%s-counter", companyName, cdnName)

	// Remove mangle rule
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
	c.sendWord("/ip/firewall/mangle/print")
	c.sendWord("?comment=" + comment)
	c.sendWord("")

	response, _ := c.readResponse()
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			id := strings.TrimPrefix(word, "=.id=")
			c.conn.SetDeadline(time.Now().Add(c.timeout))
			c.sendWord("/ip/firewall/mangle/remove")
			c.sendWord("=.id=" + id)
			c.sendWord("")
			c.readResponse()
		}
	}

	// Remove address-list entries
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
	c.sendWord("/ip/firewall/address-list/print")
	c.sendWord("?list=" + listName)
	c.sendWord("")

	response, _ = c.readResponse()
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			id := strings.TrimPrefix(word, "=.id=")
			c.conn.SetDeadline(time.Now().Add(c.timeout))
			c.sendWord("/ip/firewall/address-list/remove")
			c.sendWord("=.id=" + id)
			c.sendWord("")
			c.readResponse()
		}
	}

	log.Printf("MikroTik: Removed CDN config for %s", cdnName)
	return nil
}

// SubscriberCDNConfig holds CDN queue configuration for a subscriber
type SubscriberCDNConfig struct {
	CDNName     string
	SpeedLimit  int64  // in Mbps
	Subnets     string // Comma/newline separated CIDR subnets
	CompanyName string // Company name for queue comment
}

// SyncSubscriberCDNQueues creates or updates queue rules to limit CDN traffic for a subscriber
// CDN queues target the PPPoE interface directly so they work and get removed when PPPoE disconnects
func (c *Client) SyncSubscriberCDNQueues(subscriberIP string, username string, cdnConfigs []SubscriberCDNConfig) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	// Target the PPPoE interface directly
	pppoeInterface := "<pppoe-" + username + ">"

	for _, cdn := range cdnConfigs {
		if cdn.SpeedLimit <= 0 || cdn.Subnets == "" {
			continue
		}

		// Parse subnets
		subnets := parseSubnetList(cdn.Subnets)
		if len(subnets) == 0 {
			continue
		}

		// Use first subnet for dst
		dstAddress := strings.Join(subnets, ",")

		queueName := fmt.Sprintf("cdn-%s-%s", username, cdn.CDNName)
		// Use company name for branding in comments
		companyName := cdn.CompanyName
		if companyName == "" {
			companyName = database.GetCompanyName()
		}
		if companyName == "" {
			companyName = "ISP"
		}
		comment := fmt.Sprintf("%s-CDN-Queue-%s", companyName, username)

		// Speed limit in format "10M/10M" (upload/download) - SpeedLimit is in Mbps
		speedLimit := fmt.Sprintf("%dM/%dM", cdn.SpeedLimit, cdn.SpeedLimit)

		// Check if queue already exists
		c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
		c.sendWord("/queue/simple/print")
		c.sendWord("?name=" + queueName)
		c.sendWord("")

		response, err := c.readResponse()
		if err != nil {
			log.Printf("MikroTik: Failed to query queue: %v", err)
			continue
		}

		// Check if queue exists
		queueExists := false
		var queueID string
		for _, word := range response {
			if word == "!re" {
				queueExists = true
			}
			if strings.HasPrefix(word, "=.id=") {
				queueID = strings.TrimPrefix(word, "=.id=")
			}
		}

		if queueExists && queueID != "" {
			// Update existing queue - move to top
			c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
			c.sendWord("/queue/simple/set")
			c.sendWord("=.id=" + queueID)
			c.sendWord("=target=" + pppoeInterface)
			c.sendWord("=dst=" + dstAddress)
			c.sendWord("=max-limit=" + speedLimit)
			c.sendWord("")
			resp, _ := c.readResponse()
			hasError := false
			for _, word := range resp {
				if strings.HasPrefix(word, "!trap") {
					hasError = true
					log.Printf("MikroTik: Error updating queue: %v", resp)
				}
			}
			if !hasError {
				// Move queue to top
				c.conn.SetDeadline(time.Now().Add(c.timeout))
				c.sendWord("/queue/simple/move")
				c.sendWord("=numbers=" + queueID)
				c.sendWord("=destination=0")
				c.sendWord("")
				c.readResponse()
				log.Printf("MikroTik: Updated CDN queue %s for %s: %s dst=%s (moved to top)", cdn.CDNName, username, speedLimit, dstAddress)
			}
		} else {
			// Create new queue targeting PPPoE interface, place at top
			c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
			c.sendWord("/queue/simple/add")
			c.sendWord("=name=" + queueName)
			c.sendWord("=target=" + pppoeInterface)
			c.sendWord("=dst=" + dstAddress)
			c.sendWord("=max-limit=" + speedLimit)
			c.sendWord("=priority=1")
			c.sendWord("=comment=" + comment)
			c.sendWord("=place-before=*0")
			c.sendWord("")

			resp, err := c.readResponse()
			hasError := false
			for _, word := range resp {
				if strings.HasPrefix(word, "!trap") || strings.Contains(word, "=message=") {
					hasError = true
					log.Printf("MikroTik: Error creating CDN queue: %v", resp)
				}
			}
			if err != nil {
				log.Printf("MikroTik: Failed to create CDN queue for %s: %v", username, err)
			} else if !hasError {
				log.Printf("MikroTik: Created CDN queue %s for %s: %s dst=%s target=%s", cdn.CDNName, username, speedLimit, dstAddress, pppoeInterface)
			}
		}
	}

	return nil
}

// RemoveSubscriberCDNQueues removes all CDN queue rules for a subscriber
func (c *Client) RemoveSubscriberCDNQueues(username string, companyName string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	// Use company name for branding in comments
	if companyName == "" {
		companyName = database.GetCompanyName()
	}
	if companyName == "" {
		companyName = "ISP"
	}

	comment := fmt.Sprintf("%s-CDN-Queue-%s", companyName, username)

	// Find and remove queues with matching comment
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
	c.sendWord("/queue/simple/print")
	c.sendWord("?comment=" + comment)
	c.sendWord("")

	response, _ := c.readResponse()
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			id := strings.TrimPrefix(word, "=.id=")
			c.conn.SetDeadline(time.Now().Add(c.timeout))
			c.sendWord("/queue/simple/remove")
			c.sendWord("=.id=" + id)
			c.sendWord("")
			c.readResponse()
		}
	}

	log.Printf("MikroTik: Removed CDN queues for %s", username)
	return nil
}

// CountTTLRules counts TTL detection mangle rules by comment
func (c *Client) CountTTLRules(comment string) (int, error) {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return 0, err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))

	// Query all mangle rules and filter by comment containing our prefix
	c.sendWord("/ip/firewall/mangle/print")
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return 0, fmt.Errorf("failed to query mangle rules: %v", err)
	}

	// Count entries that have matching comment
	count := 0
	currentComment := ""
	for _, word := range response {
		if strings.HasPrefix(word, "=comment=") {
			currentComment = strings.TrimPrefix(word, "=comment=")
		}
		if word == "!re" {
			// Check if previous entry had matching comment
			if strings.Contains(currentComment, comment) {
				count++
			}
			currentComment = ""
		}
	}
	// Check last entry
	if strings.Contains(currentComment, comment) {
		count++
	}

	return count, nil
}

// CreateTTLMangleRule creates a mangle rule to mark connections by TTL value
func (c *Client) CreateTTLMangleRule(ttl int, mark string, comment string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))

	// First check if rule already exists
	c.sendWord("/ip/firewall/mangle/print")
	c.sendWord(fmt.Sprintf("?ttl=equal:%d", ttl))
	c.sendWord("?chain=prerouting")
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to check existing rules: %v", err)
	}

	// Check if rule exists
	for _, word := range response {
		if word == "!re" {
			log.Printf("MikroTik: TTL=%d rule already exists, skipping", ttl)
			return nil
		}
	}

	// Create the mangle rule
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
	c.sendWord("/ip/firewall/mangle/add")
	c.sendWord("=chain=prerouting")
	c.sendWord(fmt.Sprintf("=ttl=equal:%d", ttl))
	c.sendWord("=action=mark-connection")
	c.sendWord("=new-connection-mark=" + mark)
	c.sendWord("=passthrough=yes")
	c.sendWord("=comment=" + comment)
	c.sendWord("")

	response, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to create mangle rule: %v", err)
	}

	for _, word := range response {
		if strings.HasPrefix(word, "!trap") {
			for _, w := range response {
				if strings.HasPrefix(w, "=message=") {
					return fmt.Errorf("failed to create rule: %s", strings.TrimPrefix(w, "=message="))
				}
			}
			return fmt.Errorf("failed to create mangle rule")
		}
	}

	log.Printf("MikroTik: Created TTL=%d mangle rule with mark=%s", ttl, mark)
	return nil
}

// RemoveTTLRules removes all mangle rules with matching comment
func (c *Client) RemoveTTLRules(comment string) (int, error) {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return 0, err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))

	// Find all rules with matching comment
	c.sendWord("/ip/firewall/mangle/print")
	c.sendWord("?comment~" + comment)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return 0, fmt.Errorf("failed to query mangle rules: %v", err)
	}

	// Collect IDs to remove
	var ids []string
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			ids = append(ids, strings.TrimPrefix(word, "=.id="))
		}
	}

	// Remove each rule
	removedCount := 0
	for _, id := range ids {
		c.conn.SetDeadline(time.Now().Add(c.timeout))
		c.sendWord("/ip/firewall/mangle/remove")
		c.sendWord("=.id=" + id)
		c.sendWord("")

		_, err := c.readResponse()
		if err == nil {
			removedCount++
		}
	}

	log.Printf("MikroTik: Removed %d TTL detection rules", removedCount)
	return removedCount, nil
}

// UpdateCDNQueueSpeed updates the speed limit of a CDN queue by name
func (c *Client) UpdateCDNQueueSpeed(queueName string, speedKbps int) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	// Find queue by name
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
	c.sendWord("/queue/simple/print")
	c.sendWord("?name=" + queueName)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to query queue: %v", err)
	}

	// Get queue ID
	var queueID string
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			queueID = strings.TrimPrefix(word, "=.id=")
			break
		}
	}

	if queueID == "" {
		return fmt.Errorf("queue %s not found", queueName)
	}

	// Update queue speed
	speedLimit := fmt.Sprintf("%dk/%dk", speedKbps, speedKbps)
	c.conn.SetDeadline(time.Now().Add(c.timeout * 2))
	c.sendWord("/queue/simple/set")
	c.sendWord("=.id=" + queueID)
	c.sendWord("=max-limit=" + speedLimit)
	c.sendWord("")

	resp, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to update queue: %v", err)
	}

	for _, word := range resp {
		if strings.HasPrefix(word, "!trap") {
			return fmt.Errorf("error updating queue: %v", resp)
		}
	}

	log.Printf("MikroTik: Updated CDN queue %s to %s", queueName, speedLimit)
	return nil
}

// IPPool represents a MikroTik IP pool
type IPPool struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Ranges string `json:"ranges"`
}

// GetIPPools fetches all IP pools from MikroTik
func (c *Client) GetIPPools() ([]IPPool, error) {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	c.sendWord("/ip/pool/print")
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return nil, fmt.Errorf("failed to get IP pools: %v", err)
	}

	var pools []IPPool
	var current IPPool

	for _, word := range response {
		if word == "!re" {
			if current.Name != "" {
				pools = append(pools, current)
			}
			current = IPPool{}
		}
		if strings.HasPrefix(word, "=.id=") {
			current.ID = strings.TrimPrefix(word, "=.id=")
		}
		if strings.HasPrefix(word, "=name=") {
			current.Name = strings.TrimPrefix(word, "=name=")
		}
		if strings.HasPrefix(word, "=ranges=") {
			current.Ranges = strings.TrimPrefix(word, "=ranges=")
		}
	}
	// Don't forget last pool
	if current.Name != "" {
		pools = append(pools, current)
	}

	return pools, nil
}

// PCQConfig holds configuration for PCQ-based CDN setup
type PCQConfig struct {
	CDNName       string   // CDN name (e.g., "GGC")
	SpeedLimitM   int64    // Speed limit in Mbps (pcq-rate)
	PCQLimit      int      // PCQ limit per connection in KiB
	PCQTotalLimit int      // PCQ total limit in KiB
	TargetPools   string   // Comma-separated target pools/CIDRs
	CompanyName   string   // Company name for branding
	Subnets       []string // CDN subnets for address list
}

// CreatePCQQueueType creates a PCQ queue type for a CDN with specific speed
func (c *Client) CreatePCQQueueType(config PCQConfig) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// Queue type name includes speed (e.g., "GGC-10", "GGC-30")
	queueTypeName := fmt.Sprintf("%s-%d", config.CDNName, config.SpeedLimitM)
	pcqRate := fmt.Sprintf("%dM", config.SpeedLimitM)

	// Check if queue type already exists
	c.sendWord("/queue/type/print")
	c.sendWord("?name=" + queueTypeName)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to check queue type: %v", err)
	}

	var existingID string
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			existingID = strings.TrimPrefix(word, "=.id=")
			break
		}
	}

	if existingID != "" {
		// Update existing queue type
		c.sendWord("/queue/type/set")
		c.sendWord("=.id=" + existingID)
		c.sendWord("=pcq-rate=" + pcqRate)
		c.sendWord(fmt.Sprintf("=pcq-limit=%dKiB", config.PCQLimit))
		c.sendWord(fmt.Sprintf("=pcq-total-limit=%dKiB", config.PCQTotalLimit))
		c.sendWord("")
	} else {
		// Create new queue type
		c.sendWord("/queue/type/add")
		c.sendWord("=name=" + queueTypeName)
		c.sendWord("=kind=pcq")
		c.sendWord("=pcq-rate=" + pcqRate)
		c.sendWord("=pcq-classifier=dst-address")
		c.sendWord(fmt.Sprintf("=pcq-limit=%dKiB", config.PCQLimit))
		c.sendWord(fmt.Sprintf("=pcq-total-limit=%dKiB", config.PCQTotalLimit))
		c.sendWord("=pcq-burst-rate=0")
		c.sendWord("=pcq-burst-threshold=0")
		c.sendWord("=pcq-burst-time=10s")
		c.sendWord("=pcq-src-address-mask=32")
		c.sendWord("=pcq-dst-address-mask=32")
		c.sendWord("")
	}

	response, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to create/update queue type: %v", err)
	}

	for _, word := range response {
		if strings.HasPrefix(word, "!trap") {
			return fmt.Errorf("error creating queue type: %v", response)
		}
	}

	log.Printf("MikroTik: Created/updated PCQ queue type %s with rate %s", queueTypeName, pcqRate)
	return nil
}

// CreateCDNMangleRule creates a mangle rule to mark packets from a CDN
func (c *Client) CreateCDNMangleRule(config PCQConfig) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// Use same address list name as SyncCDNAddressList: "CDN-{name}"
	addressListName := fmt.Sprintf("CDN-%s", config.CDNName)
	packetMark := fmt.Sprintf("CDN-%s", config.CDNName)
	comment := fmt.Sprintf("%s CDN %s packet mark", config.CompanyName, config.CDNName)

	// Check if mangle rule already exists
	c.sendWord("/ip/firewall/mangle/print")
	c.sendWord("?comment=" + comment)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to check mangle rule: %v", err)
	}

	var existingID string
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			existingID = strings.TrimPrefix(word, "=.id=")
			break
		}
	}

	if existingID != "" {
		// Delete existing rule - MikroTik doesn't allow changing chain with /set
		c.sendWord("/ip/firewall/mangle/remove")
		c.sendWord("=.id=" + existingID)
		c.sendWord("")
		c.readResponse()
		log.Printf("MikroTik: Removed old mangle rule for CDN %s to recreate in forward chain", config.CDNName)
	}

	// Create new mangle rule - MUST be in forward chain (before simple queues)
	// postrouting is too late - packets are already queued
	c.sendWord("/ip/firewall/mangle/add")
	c.sendWord("=chain=forward")
	c.sendWord("=action=mark-packet")
	c.sendWord("=new-packet-mark=" + packetMark)
	c.sendWord("=passthrough=no")
	c.sendWord("=src-address-list=" + addressListName)
	c.sendWord("=comment=" + comment)
	c.sendWord("")

	response, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to create/update mangle rule: %v", err)
	}

	for _, word := range response {
		if strings.HasPrefix(word, "!trap") {
			return fmt.Errorf("error creating mangle rule: %v", response)
		}
	}

	log.Printf("MikroTik: Created/updated mangle rule for CDN %s", config.CDNName)
	return nil
}

// ipRangeToCIDR converts IP range (e.g., "14.12.12.10-14.12.12.254") to CIDR (e.g., "14.12.12.0/24")
func ipRangeToCIDR(ipRange string) string {
	// If already in CIDR format, return as is
	if strings.Contains(ipRange, "/") {
		return ipRange
	}

	// Split by dash for range format
	parts := strings.Split(ipRange, "-")
	if len(parts) != 2 {
		// Not a range, return as is (might be single IP)
		return ipRange
	}

	startIP := strings.TrimSpace(parts[0])
	endIP := strings.TrimSpace(parts[1])

	// Parse start IP
	startParts := strings.Split(startIP, ".")
	endParts := strings.Split(endIP, ".")
	if len(startParts) != 4 || len(endParts) != 4 {
		return ipRange
	}

	// Simple heuristic: find where they differ and calculate subnet
	// For typical pools like x.x.x.10-x.x.x.254, we assume /24
	// For x.x.0.1-x.x.255.254, we assume /16

	// Check if first 3 octets are same (typical /24)
	if startParts[0] == endParts[0] && startParts[1] == endParts[1] && startParts[2] == endParts[2] {
		return fmt.Sprintf("%s.%s.%s.0/24", startParts[0], startParts[1], startParts[2])
	}

	// Check if first 2 octets are same (could be /16 to /23)
	if startParts[0] == endParts[0] && startParts[1] == endParts[1] {
		// Approximate based on third octet range
		startOct3, _ := strconv.Atoi(startParts[2])
		endOct3, _ := strconv.Atoi(endParts[2])
		diff := endOct3 - startOct3 + 1

		if diff <= 2 {
			return fmt.Sprintf("%s.%s.%s.0/23", startParts[0], startParts[1], startParts[2])
		} else if diff <= 4 {
			return fmt.Sprintf("%s.%s.%d.0/22", startParts[0], startParts[1], startOct3&0xFC)
		} else if diff <= 8 {
			return fmt.Sprintf("%s.%s.%d.0/21", startParts[0], startParts[1], startOct3&0xF8)
		} else {
			return fmt.Sprintf("%s.%s.0.0/16", startParts[0], startParts[1])
		}
	}

	// Fallback: return as /16 based on first two octets
	return fmt.Sprintf("%s.%s.0.0/16", startParts[0], startParts[1])
}

// convertTargetPoolsToCIDR converts comma-separated IP ranges to CIDR format
func convertTargetPoolsToCIDR(pools string) string {
	var cidrs []string
	for _, pool := range strings.Split(pools, ",") {
		pool = strings.TrimSpace(pool)
		if pool != "" {
			cidrs = append(cidrs, ipRangeToCIDR(pool))
		}
	}
	return strings.Join(cidrs, ",")
}

// CreatePCQSimpleQueue creates a simple queue using PCQ for a CDN
func (c *Client) CreatePCQSimpleQueue(config PCQConfig) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// Queue name format: "GGC-30M" (CDN name with speed limit)
	queueName := fmt.Sprintf("%s-%dM", config.CDNName, config.SpeedLimitM)
	// Queue type includes speed: "GGC-30" (must match CreatePCQQueueType)
	queueTypeName := fmt.Sprintf("%s-%d", config.CDNName, config.SpeedLimitM)
	// Packet mark matches mangle rule: "CDN-GGC"
	packetMark := fmt.Sprintf("CDN-%s", config.CDNName)
	// Convert IP ranges to CIDR format for MikroTik
	targetCIDR := convertTargetPoolsToCIDR(config.TargetPools)

	// Comment for identification - includes speed so each speed gets own queue
	queueComment := fmt.Sprintf("PCQ queue for CDN %s %dM", config.CDNName, config.SpeedLimitM)

	// Check if simple queue already exists (by comment)
	c.sendWord("/queue/simple/print")
	c.sendWord("?comment=" + queueComment)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to check simple queue: %v", err)
	}

	var existingID string
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			existingID = strings.TrimPrefix(word, "=.id=")
			break
		}
	}

	// Queue type format: upload/download
	queueType := fmt.Sprintf("%s/%s", queueTypeName, queueTypeName)

	if existingID != "" {
		// Update existing simple queue (including name if speed changed)
		c.sendWord("/queue/simple/set")
		c.sendWord("=.id=" + existingID)
		c.sendWord("=name=" + queueName)
		c.sendWord("=target=" + targetCIDR)
		c.sendWord("=packet-marks=" + packetMark)
		c.sendWord("=queue=" + queueType)
		c.sendWord("=max-limit=1G/1G")
		c.sendWord("=comment=" + queueComment)
		c.sendWord("")
	} else {
		// Create new simple queue
		c.sendWord("/queue/simple/add")
		c.sendWord("=name=" + queueName)
		c.sendWord("=target=" + targetCIDR)
		c.sendWord("=packet-marks=" + packetMark)
		c.sendWord("=queue=" + queueType)
		c.sendWord("=max-limit=1G/1G")
		c.sendWord("=priority=8/8")
		c.sendWord("=comment=" + queueComment)
		c.sendWord("")
	}

	response, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to create/update simple queue: %v", err)
	}

	for _, word := range response {
		if strings.HasPrefix(word, "!trap") {
			return fmt.Errorf("error creating simple queue: %v", response)
		}
	}

	// Move queue to top (position 0) so it's processed before user queues
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/queue/simple/print")
	c.sendWord("?comment=" + queueComment)
	c.sendWord("")

	response, err = c.readResponse()
	if err == nil {
		for _, word := range response {
			if strings.HasPrefix(word, "=.id=") {
				queueID := strings.TrimPrefix(word, "=.id=")
				// Move to top (destination 0)
				c.sendWord("/queue/simple/move")
				c.sendWord("=numbers=" + queueID)
				c.sendWord("=destination=0")
				c.sendWord("")
				c.readResponse()
				log.Printf("MikroTik: Moved PCQ queue %s to top", queueName)
				break
			}
		}
	}

	log.Printf("MikroTik: Created/updated PCQ simple queue %s for CDN %s (target=%s)", queueName, config.CDNName, targetCIDR)
	return nil
}

// SyncCDNPCQSetup creates the complete PCQ setup for a CDN (address list + queue type + mangle + simple queue)
func (c *Client) SyncCDNPCQSetup(config PCQConfig) error {
	// Step 0: Sync CDN address list (subnets) - required for mangle rule
	if len(config.Subnets) > 0 {
		cdnConfig := CDNConfig{
			Name:        config.CDNName,
			Subnets:     config.Subnets,
			CompanyName: config.CompanyName,
		}
		if err := c.SyncCDNAddressList(cdnConfig); err != nil {
			log.Printf("MikroTik: Warning - failed to sync address list for CDN %s: %v", config.CDNName, err)
			// Continue anyway, mangle rule will just not match any traffic
		}
	} else {
		log.Printf("MikroTik: Warning - no subnets configured for CDN %s, address list not synced", config.CDNName)
	}

	// Step 1: Create PCQ queue type
	if err := c.CreatePCQQueueType(config); err != nil {
		return fmt.Errorf("failed to create queue type: %v", err)
	}

	// Step 2: Create mangle rule (uses address list CDN-{name})
	if err := c.CreateCDNMangleRule(config); err != nil {
		return fmt.Errorf("failed to create mangle rule: %v", err)
	}

	// Step 3: Create simple queue with PCQ
	if err := c.CreatePCQSimpleQueue(config); err != nil {
		return fmt.Errorf("failed to create simple queue: %v", err)
	}

	log.Printf("MikroTik: Complete PCQ setup synced for CDN %s", config.CDNName)
	return nil
}

// RemoveCDNPCQSetup removes all PCQ components for a CDN with specific speed
// This removes: queue type, simple queue. Mangle rules and address lists are shared per CDN
// and should only be removed when no services use that CDN anymore.
func (c *Client) RemoveCDNPCQSetup(cdnName string, speedLimitM int64, companyName string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	// Queue type includes speed: "GGC-10"
	queueTypeName := fmt.Sprintf("%s-%d", cdnName, speedLimitM)
	// Simple queue comment includes speed
	queueComment := fmt.Sprintf("PCQ queue for CDN %s %dM", cdnName, speedLimitM)

	// Remove simple queue first (search by comment)
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/queue/simple/print")
	c.sendWord("?comment=" + queueComment)
	c.sendWord("")

	response, err := c.readResponse()
	if err == nil {
		for _, word := range response {
			if strings.HasPrefix(word, "=.id=") {
				queueID := strings.TrimPrefix(word, "=.id=")
				c.sendWord("/queue/simple/remove")
				c.sendWord("=.id=" + queueID)
				c.sendWord("")
				c.readResponse()
				log.Printf("MikroTik: Removed simple queue for CDN %s %dM", cdnName, speedLimitM)
				break
			}
		}
	}

	// Remove queue type
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/queue/type/print")
	c.sendWord("?name=" + queueTypeName)
	c.sendWord("")

	response, err = c.readResponse()
	if err == nil {
		for _, word := range response {
			if strings.HasPrefix(word, "=.id=") {
				typeID := strings.TrimPrefix(word, "=.id=")
				c.sendWord("/queue/type/remove")
				c.sendWord("=.id=" + typeID)
				c.sendWord("")
				c.readResponse()
				log.Printf("MikroTik: Removed queue type %s", queueTypeName)
				break
			}
		}
	}

	log.Printf("MikroTik: Removed PCQ setup for CDN %s %dM", cdnName, speedLimitM)
	return nil
}

// RemoveCDNMangleAndAddressList removes mangle rules and address list for a CDN
// Only call this when NO services are using this CDN anymore
func (c *Client) RemoveCDNMangleAndAddressList(cdnName, companyName string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	// Comment used for mangle rule
	mangleComment := fmt.Sprintf("%s CDN %s packet mark", companyName, cdnName)
	// Address list name
	addressListName := fmt.Sprintf("CDN-%s", cdnName)

	// Remove mangle rule
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/mangle/print")
	c.sendWord("?comment=" + mangleComment)
	c.sendWord("")

	response, err := c.readResponse()
	if err == nil {
		for _, word := range response {
			if strings.HasPrefix(word, "=.id=") {
				mangleID := strings.TrimPrefix(word, "=.id=")
				c.sendWord("/ip/firewall/mangle/remove")
				c.sendWord("=.id=" + mangleID)
				c.sendWord("")
				c.readResponse()
				log.Printf("MikroTik: Removed mangle rule for CDN %s", cdnName)
				break
			}
		}
	}

	// Remove address list entries
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/address-list/print")
	c.sendWord("?list=" + addressListName)
	c.sendWord("")

	response, err = c.readResponse()
	if err == nil {
		// Collect all IDs first
		var ids []string
		for _, word := range response {
			if strings.HasPrefix(word, "=.id=") {
				ids = append(ids, strings.TrimPrefix(word, "=.id="))
			}
		}
		// Remove all entries
		for _, id := range ids {
			c.sendWord("/ip/firewall/address-list/remove")
			c.sendWord("=.id=" + id)
			c.sendWord("")
			c.readResponse()
		}
		if len(ids) > 0 {
			log.Printf("MikroTik: Removed %d address list entries for CDN %s", len(ids), cdnName)
		}
	}

	return nil
}

// SubscriberCDNOverrideConfig holds configuration for a subscriber's CDN override queue
type SubscriberCDNOverrideConfig struct {
	SubscriberIP string // Subscriber's current IP address
	Username     string // Subscriber username
	CDNName      string // CDN name (e.g., "GGC")
	SpeedLimitM  int64  // Speed limit in Mbps (to use the correct PCQ queue type)
	CompanyName  string // Company name for queue comment
}

// SyncSubscriberCDNOverrideQueue creates or updates a per-subscriber CDN override queue
// This allows a subscriber to use a different CDN speed than their service default
// The queue intercepts CDN traffic for this specific subscriber and applies the override speed
func (c *Client) SyncSubscriberCDNOverrideQueue(config SubscriberCDNOverrideConfig) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// Queue name format: "CDN-Override-{username}"
	queueName := fmt.Sprintf("CDN-Override-%s", config.Username)
	// Queue type includes speed: "GGC-30" (must match CreatePCQQueueType)
	queueTypeName := fmt.Sprintf("%s-%d", config.CDNName, config.SpeedLimitM)
	// Packet mark matches mangle rule: "CDN-GGC"
	packetMark := fmt.Sprintf("CDN-%s", config.CDNName)
	// Target is subscriber's current IP
	target := config.SubscriberIP

	// Comment for identification
	queueComment := fmt.Sprintf("%s CDN Override for %s", config.CompanyName, config.Username)

	// Check if override queue already exists (by comment)
	c.sendWord("/queue/simple/print")
	c.sendWord("?comment=" + queueComment)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to check subscriber CDN override queue: %v", err)
	}

	var existingID string
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			existingID = strings.TrimPrefix(word, "=.id=")
			break
		}
	}

	// Queue type format: upload/download
	queueType := fmt.Sprintf("%s/%s", queueTypeName, queueTypeName)

	if existingID != "" {
		// Update existing override queue
		c.conn.SetDeadline(time.Now().Add(c.timeout))
		c.sendWord("/queue/simple/set")
		c.sendWord("=.id=" + existingID)
		c.sendWord("=name=" + queueName)
		c.sendWord("=target=" + target)
		c.sendWord("=packet-marks=" + packetMark)
		c.sendWord("=queue=" + queueType)
		c.sendWord("=max-limit=1G/1G")
		c.sendWord("=priority=1/1") // Higher priority than PCQ queues (which use 8/8)
		c.sendWord("")
	} else {
		// Create new override queue
		c.sendWord("/queue/simple/add")
		c.sendWord("=name=" + queueName)
		c.sendWord("=target=" + target)
		c.sendWord("=packet-marks=" + packetMark)
		c.sendWord("=queue=" + queueType)
		c.sendWord("=max-limit=1G/1G")
		c.sendWord("=priority=1/1") // Higher priority than PCQ queues
		c.sendWord("=comment=" + queueComment)
		c.sendWord("")
	}

	response, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to create/update subscriber CDN override queue: %v", err)
	}

	for _, word := range response {
		if strings.HasPrefix(word, "!trap") {
			return fmt.Errorf("error creating subscriber CDN override queue: %v", response)
		}
	}

	// Move queue to top (position 0) so it's processed BEFORE PPPoE user queues
	// This is critical - MikroTik processes queues in order, and we need to match before the PPPoE queue
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/queue/simple/print")
	c.sendWord("?comment=" + queueComment)
	c.sendWord("")

	response, err = c.readResponse()
	if err == nil {
		for _, word := range response {
			if strings.HasPrefix(word, "=.id=") {
				queueID := strings.TrimPrefix(word, "=.id=")
				// Move to top (destination 0)
				c.conn.SetDeadline(time.Now().Add(c.timeout))
				c.sendWord("/queue/simple/move")
				c.sendWord("=numbers=" + queueID)
				c.sendWord("=destination=0")
				c.sendWord("")
				c.readResponse()
				log.Printf("MikroTik: Moved CDN override queue %s to top", queueName)
				break
			}
		}
	}

	log.Printf("MikroTik: Created/updated CDN override queue for %s -> %s at %dM", config.Username, config.CDNName, config.SpeedLimitM)
	return nil
}

// RemoveSubscriberCDNOverrideQueue removes the per-subscriber CDN override queue
func (c *Client) RemoveSubscriberCDNOverrideQueue(username string, companyName string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}
	c.conn.SetDeadline(time.Now().Add(c.timeout))

	// Comment for identification
	queueComment := fmt.Sprintf("%s CDN Override for %s", companyName, username)

	// Find and remove the queue
	c.sendWord("/queue/simple/print")
	c.sendWord("?comment=" + queueComment)
	c.sendWord("")

	response, _ := c.readResponse()
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			queueID := strings.TrimPrefix(word, "=.id=")
			c.conn.SetDeadline(time.Now().Add(c.timeout))
			c.sendWord("/queue/simple/remove")
			c.sendWord("=.id=" + queueID)
			c.sendWord("")
			c.readResponse()
			log.Printf("MikroTik: Removed CDN override queue for %s", username)
			return nil
		}
	}

	return nil // Queue didn't exist, nothing to remove
}

// AddStaticIPToAddressList adds a static IP to the STATIC-IPS address list on MikroTik
// This is used to reserve IPs so they won't be assigned from the pool
func (c *Client) AddStaticIPToAddressList(ip string, subscriberUsername string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	listName := "STATIC-IPS"
	comment := fmt.Sprintf("Static IP for %s", subscriberUsername)

	// Check if IP already exists in the list
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/address-list/print")
	c.sendWord("?list=" + listName)
	c.sendWord("?address=" + ip)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to query address-list: %v", err)
	}

	// Check if entry already exists
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			// Already exists, update comment
			id := strings.TrimPrefix(word, "=.id=")
			c.conn.SetDeadline(time.Now().Add(c.timeout))
			c.sendWord("/ip/firewall/address-list/set")
			c.sendWord("=.id=" + id)
			c.sendWord("=comment=" + comment)
			c.sendWord("")
			c.readResponse()
			log.Printf("MikroTik: Updated static IP %s in address-list for %s", ip, subscriberUsername)
			return nil
		}
	}

	// Add new entry
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/address-list/add")
	c.sendWord("=list=" + listName)
	c.sendWord("=address=" + ip)
	c.sendWord("=comment=" + comment)
	c.sendWord("")

	_, err = c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to add static IP to address-list: %v", err)
	}

	log.Printf("MikroTik: Added static IP %s to address-list STATIC-IPS for %s", ip, subscriberUsername)

	// Ensure the scheduler script exists to protect static IPs from pool assignment
	c.ensureStaticIPProtectionScript()

	return nil
}

// ensureStaticIPProtectionScript creates a scheduler script on MikroTik that protects static IPs
// from being assigned by the pool. This script runs every 30 seconds and removes static IPs
// from the pool's "used" list, making them unavailable for dynamic assignment.
func (c *Client) ensureStaticIPProtectionScript() {
	schedulerName := "protect-static-ips"

	// Check if scheduler already exists
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/system/scheduler/print")
	c.sendWord("?name=" + schedulerName)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		log.Printf("MikroTik: Failed to check scheduler: %v", err)
		return
	}

	// Check if scheduler exists
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			// Scheduler already exists
			log.Printf("MikroTik: Static IP protection scheduler already exists")
			return
		}
	}

	// Create the scheduler script
	// This script removes static IPs from the pool's used list every 30 seconds
	script := `:foreach entry in=[/ip firewall address-list find list=STATIC-IPS] do={:local addr [/ip firewall address-list get $entry address]; :foreach used in=[/ip pool used find address=$addr] do={/ip pool used remove $used}}`

	// Get company name for branding in comment
	companyName := database.GetCompanyName()
	if companyName == "" {
		companyName = "ISP"
	}

	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/system/scheduler/add")
	c.sendWord("=name=" + schedulerName)
	c.sendWord("=interval=30s")
	c.sendWord("=on-event=" + script)
	c.sendWord("=comment=" + companyName + ": Protects static IPs from pool assignment")
	c.sendWord("")

	_, err = c.readResponse()
	if err != nil {
		log.Printf("MikroTik: Failed to create static IP protection scheduler: %v", err)
		return
	}

	log.Printf("MikroTik: Created static IP protection scheduler")
}

// RemoveStaticIPFromAddressList removes a static IP from the STATIC-IPS address list on MikroTik
func (c *Client) RemoveStaticIPFromAddressList(ip string) error {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return err
		}
	}

	listName := "STATIC-IPS"

	// Find the entry
	c.conn.SetDeadline(time.Now().Add(c.timeout))
	c.sendWord("/ip/firewall/address-list/print")
	c.sendWord("?list=" + listName)
	c.sendWord("?address=" + ip)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return fmt.Errorf("failed to query address-list: %v", err)
	}

	// Find and remove the entry
	for _, word := range response {
		if strings.HasPrefix(word, "=.id=") {
			id := strings.TrimPrefix(word, "=.id=")
			c.conn.SetDeadline(time.Now().Add(c.timeout))
			c.sendWord("/ip/firewall/address-list/remove")
			c.sendWord("=.id=" + id)
			c.sendWord("")
			c.readResponse()
			log.Printf("MikroTik: Removed static IP %s from address-list STATIC-IPS", ip)
			return nil
		}
	}

	// Not found, that's okay
	log.Printf("MikroTik: Static IP %s not found in address-list STATIC-IPS (already removed)", ip)
	return nil
}

// TorchEntry represents a single torch traffic entry (like MikroTik Winbox torch)
type TorchEntry struct {
	SrcAddress string `json:"src_address"`
	DstAddress string `json:"dst_address"`
	SrcPort    int    `json:"src_port"`
	DstPort    int    `json:"dst_port"`
	Protocol   string `json:"protocol"`     // tcp, udp, icmp, etc.
	ProtoNum   int    `json:"proto_num"`    // 6=tcp, 17=udp, 1=icmp
	MacProto   string `json:"mac_protocol"` // 800=IPv4, 806=ARP, 86dd=IPv6
	VlanID     int    `json:"vlan_id"`
	DSCP       int    `json:"dscp"`
	TxRate     int64  `json:"tx_rate"`      // bytes per second
	RxRate     int64  `json:"rx_rate"`      // bytes per second
	TxPackets  int64  `json:"tx_packets"`
	RxPackets  int64  `json:"rx_packets"`
}

// TorchResult contains the result of a torch operation
type TorchResult struct {
	Entries   []TorchEntry `json:"entries"`
	TotalTx   int64        `json:"total_tx"`
	TotalRx   int64        `json:"total_rx"`
	Duration  string       `json:"duration"`
	Interface string       `json:"interface"`
	FilterIP  string       `json:"filter_ip"`
}

// GetLiveTorch runs torch on a PPPoE interface for a specific subscriber IP
// Returns real-time traffic breakdown by connection (like MikroTik Winbox torch)
func (c *Client) GetLiveTorch(subscriberIP string, durationSec int) (*TorchResult, error) {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}

	if durationSec <= 0 {
		durationSec = 3
	}
	if durationSec > 10 {
		durationSec = 10 // Max 10 seconds to avoid timeout
	}

	// Set longer timeout for torch operation
	c.conn.SetDeadline(time.Now().Add(time.Duration(durationSec+10) * time.Second))

	// Find the PPPoE interface for this subscriber
	c.sendWord("/ppp/active/print")
	c.sendWord("?address=" + subscriberIP)
	c.sendWord("")

	response, err := c.readResponse()
	if err != nil {
		return nil, fmt.Errorf("failed to find PPPoE session: %v", err)
	}

	// Find the interface name from PPP active session
	var ifaceName string
	var username string
	for _, word := range response {
		if strings.HasPrefix(word, "=name=") {
			username = strings.TrimPrefix(word, "=name=")
			// MikroTik PPPoE dynamic interfaces are named <pppoe-username>
			ifaceName = "<pppoe-" + username + ">"
			break
		}
	}

	if ifaceName == "" {
		return nil, fmt.Errorf("subscriber not connected or interface not found")
	}

	log.Printf("Torch: Found PPPoE session for IP %s, username=%s, interface=%s", subscriberIP, username, ifaceName)

	result := &TorchResult{
		Entries:   make([]TorchEntry, 0),
		Interface: ifaceName,
		FilterIP:  subscriberIP,
		Duration:  fmt.Sprintf("%ds", durationSec),
	}

	// Run torch command with full details
	// Based on MikroTik API docs: need interface, src-address, dst-address, port filters
	c.conn.SetDeadline(time.Now().Add(time.Duration(durationSec+10) * time.Second))
	c.sendWord("/tool/torch")
	c.sendWord("=interface=" + ifaceName)
	c.sendWord("=src-address=0.0.0.0/0")
	c.sendWord("=dst-address=0.0.0.0/0")
	c.sendWord("=port=any")
	c.sendWord("=ip-protocol=any")
	c.sendWord("=duration=" + strconv.Itoa(durationSec))
	c.sendWord("")

	// Read torch results
	entries := make(map[string]*TorchEntry)
	log.Printf("Torch: Starting to read responses for interface %s", ifaceName)
	responseCount := 0

	for {
		word, err := c.readWord()
		if err != nil {
			log.Printf("Torch: Read error: %v", err)
			break
		}

		if word == "!done" {
			log.Printf("Torch: Received !done after %d responses", responseCount)
			break
		}

		if word == "!re" {
			responseCount++
			entry := &TorchEntry{}
			key := ""

			// Read all attributes
			for {
				attr, err := c.readWord()
				if err != nil {
					break
				}
				if attr == "" {
					break
				}

				if strings.HasPrefix(attr, "=src-address=") {
					entry.SrcAddress = strings.TrimPrefix(attr, "=src-address=")
				} else if strings.HasPrefix(attr, "=dst-address=") {
					entry.DstAddress = strings.TrimPrefix(attr, "=dst-address=")
				} else if strings.HasPrefix(attr, "=ip-protocol=") {
					entry.ProtoNum, _ = strconv.Atoi(strings.TrimPrefix(attr, "=ip-protocol="))
					switch entry.ProtoNum {
					case 0:
						entry.Protocol = "" // HOPOPT or unspecified
					case 1:
						entry.Protocol = "icmp"
					case 6:
						entry.Protocol = "tcp"
					case 17:
						entry.Protocol = "udp"
					case 47:
						entry.Protocol = "gre"
					case 50:
						entry.Protocol = "esp"
					case 51:
						entry.Protocol = "ah"
					case 58:
						entry.Protocol = "icmpv6"
					default:
						entry.Protocol = strconv.Itoa(entry.ProtoNum)
					}
				} else if strings.HasPrefix(attr, "=src-port=") {
					entry.SrcPort, _ = strconv.Atoi(strings.TrimPrefix(attr, "=src-port="))
				} else if strings.HasPrefix(attr, "=dst-port=") {
					entry.DstPort, _ = strconv.Atoi(strings.TrimPrefix(attr, "=dst-port="))
				} else if strings.HasPrefix(attr, "=mac-protocol=") {
					entry.MacProto = strings.TrimPrefix(attr, "=mac-protocol=")
				} else if strings.HasPrefix(attr, "=vlan-id=") {
					entry.VlanID, _ = strconv.Atoi(strings.TrimPrefix(attr, "=vlan-id="))
				} else if strings.HasPrefix(attr, "=dscp=") {
					entry.DSCP, _ = strconv.Atoi(strings.TrimPrefix(attr, "=dscp="))
				} else if strings.HasPrefix(attr, "=tx=") {
					// MikroTik returns bits per second, convert to bytes for frontend
					bits, _ := strconv.ParseInt(strings.TrimPrefix(attr, "=tx="), 10, 64)
					entry.TxRate = bits / 8
				} else if strings.HasPrefix(attr, "=rx=") {
					// MikroTik returns bits per second, convert to bytes for frontend
					bits, _ := strconv.ParseInt(strings.TrimPrefix(attr, "=rx="), 10, 64)
					entry.RxRate = bits / 8
				} else if strings.HasPrefix(attr, "=tx-packets=") {
					entry.TxPackets, _ = strconv.ParseInt(strings.TrimPrefix(attr, "=tx-packets="), 10, 64)
				} else if strings.HasPrefix(attr, "=rx-packets=") {
					entry.RxPackets, _ = strconv.ParseInt(strings.TrimPrefix(attr, "=rx-packets="), 10, 64)
				}
			}

			// Skip aggregate/summary rows (those without valid addresses)
			// MikroTik torch returns summary rows with empty addresses
			if entry.SrcAddress == "" || entry.DstAddress == "" {
				continue
			}

			// If protocol wasn't detected but we have ports, infer the protocol
			// Most port-based traffic is TCP
			if entry.Protocol == "" && (entry.SrcPort > 0 || entry.DstPort > 0) {
				entry.Protocol = "tcp"
				entry.ProtoNum = 6
			}

			// Create unique key for this flow
			key = fmt.Sprintf("%s:%d-%s:%d-%s", entry.SrcAddress, entry.SrcPort, entry.DstAddress, entry.DstPort, entry.Protocol)

			// Aggregate or add new entry
			if existing, ok := entries[key]; ok {
				existing.TxRate = entry.TxRate
				existing.RxRate = entry.RxRate
				existing.TxPackets = entry.TxPackets
				existing.RxPackets = entry.RxPackets
			} else {
				entries[key] = entry
			}
		}

		if word == "!trap" {
			errMsg := ""
			for {
				attr, err := c.readWord()
				if err != nil || attr == "" {
					break
				}
				if strings.HasPrefix(attr, "=message=") {
					errMsg = strings.TrimPrefix(attr, "=message=")
				}
			}
			log.Printf("Torch: Error from router: %s", errMsg)
			return nil, fmt.Errorf("torch error: %s", errMsg)
		}
	}

	// Convert map to slice and calculate totals
	for _, entry := range entries {
		result.Entries = append(result.Entries, *entry)
		result.TotalTx += entry.TxRate
		result.TotalRx += entry.RxRate
	}

	log.Printf("Torch: Completed with %d unique flows, TotalTx=%d, TotalRx=%d", len(result.Entries), result.TotalTx, result.TotalRx)

	// Sort by TX rate descending (highest bandwidth first)
	for i := 0; i < len(result.Entries); i++ {
		for j := i + 1; j < len(result.Entries); j++ {
			if result.Entries[j].TxRate > result.Entries[i].TxRate {
				result.Entries[i], result.Entries[j] = result.Entries[j], result.Entries[i]
			}
		}
	}

	return result, nil
}

// PingResult contains the result of a ping operation
type PingResult struct {
	Host       string  `json:"host"`
	Sent       int     `json:"sent"`
	Received   int     `json:"received"`
	PacketLoss int     `json:"packet_loss"`
	MinRTT     float64 `json:"min_rtt"`
	AvgRTT     float64 `json:"avg_rtt"`
	MaxRTT     float64 `json:"max_rtt"`
	Status     string  `json:"status"`
}

// Ping executes ping command on MikroTik to reach subscriber IP
func (c *Client) Ping(ip string, count int) (*PingResult, error) {
	if c.conn == nil {
		if err := c.Connect(); err != nil {
			return nil, err
		}
	}

	if count <= 0 {
		count = 4
	}
	if count > 10 {
		count = 10
	}

	result := &PingResult{
		Host:   ip,
		Sent:   count,
		Status: "unknown",
	}

	// Set timeout for ping operation
	c.conn.SetDeadline(time.Now().Add(time.Duration(count*2+5) * time.Second))

	// Run ping command via MikroTik API with fast interval
	c.sendWord("/ping")
	c.sendWord("=address=" + ip)
	c.sendWord("=count=" + strconv.Itoa(count))
	c.sendWord("=interval=200ms")
	c.sendWord("")

	// Read ping responses
	received := 0
	var rtts []float64

	for {
		word, err := c.readWord()
		if err != nil {
			break
		}

		if word == "!done" {
			break
		}

		if word == "!re" {
			// Read ping reply attributes
			for {
				attr, err := c.readWord()
				if err != nil || attr == "" {
					break
				}

				if strings.HasPrefix(attr, "=time=") {
					// Got a reply - parse RTT
					// MikroTik formats: "301us", "94ms514us", "1s200ms", "5ms"
					timeStr := strings.TrimPrefix(attr, "=time=")
					var rtt float64

					// Check for combined format like "94ms514us"
					if strings.Contains(timeStr, "ms") && strings.Contains(timeStr, "us") {
						// Format: NNmsNNNus
						parts := strings.Split(timeStr, "ms")
						if len(parts) == 2 {
							ms, _ := strconv.ParseFloat(parts[0], 64)
							usStr := strings.TrimSuffix(parts[1], "us")
							us, _ := strconv.ParseFloat(usStr, 64)
							rtt = ms + us/1000.0
						}
					} else if strings.HasSuffix(timeStr, "us") {
						// Microseconds only - convert to milliseconds
						timeStr = strings.TrimSuffix(timeStr, "us")
						if val, err := strconv.ParseFloat(timeStr, 64); err == nil {
							rtt = val / 1000.0
						}
					} else if strings.HasSuffix(timeStr, "ms") {
						// Milliseconds only
						timeStr = strings.TrimSuffix(timeStr, "ms")
						if val, err := strconv.ParseFloat(timeStr, 64); err == nil {
							rtt = val
						}
					} else if strings.HasSuffix(timeStr, "s") {
						// Seconds - convert to milliseconds
						timeStr = strings.TrimSuffix(timeStr, "s")
						if val, err := strconv.ParseFloat(timeStr, 64); err == nil {
							rtt = val * 1000.0
						}
					}
					if rtt > 0 {
						rtts = append(rtts, rtt)
						received++
					}
				}
			}
		}

		if word == "!trap" {
			for {
				attr, err := c.readWord()
				if err != nil || attr == "" {
					break
				}
			}
			result.Status = "error"
			return result, fmt.Errorf("ping failed")
		}
	}

	result.Received = received
	if count > 0 {
		result.PacketLoss = ((count - received) * 100) / count
	}

	if len(rtts) > 0 {
		var sum float64
		result.MinRTT = rtts[0]
		result.MaxRTT = rtts[0]
		for _, rtt := range rtts {
			sum += rtt
			if rtt < result.MinRTT {
				result.MinRTT = rtt
			}
			if rtt > result.MaxRTT {
				result.MaxRTT = rtt
			}
		}
		result.AvgRTT = sum / float64(len(rtts))
		result.Status = "success"
	} else {
		result.Status = "timeout"
	}

	return result, nil
}
