package services

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/proisp/backend/internal/database"
	"github.com/proisp/backend/internal/models"
)

// WhatsAppService handles sending WhatsApp messages via Ultramsg or ProxRad
type WhatsAppService struct {
	client *http.Client
}

// NewWhatsAppService creates a new WhatsApp service
func NewWhatsAppService() *WhatsAppService {
	return &WhatsAppService{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

// WhatsAppConfig holds WhatsApp configuration
type WhatsAppConfig struct {
	InstanceID string
	Token      string
}

// ProxRadConfig holds ProxRad (proxsms.com) WhatsApp configuration
type ProxRadConfig struct {
	APISecret     string
	AccountUnique string
	APIBase       string
}

// getProvider reads the configured WhatsApp provider from DB
func (s *WhatsAppService) getProvider() string {
	var setting models.SystemPreference
	if err := database.DB.Where("key = ?", "whatsapp_provider").First(&setting).Error; err == nil {
		return setting.Value
	}
	return "ultramsg"
}

// GetProxRadConfig retrieves ProxRad configuration from database
func (s *WhatsAppService) GetProxRadConfig() (*ProxRadConfig, error) {
	settings := make(map[string]string)
	keys := []string{"proxrad_api_secret", "proxrad_account_unique", "proxrad_api_base"}
	for _, key := range keys {
		var setting models.SystemPreference
		if err := database.DB.Where("key = ?", key).First(&setting).Error; err == nil {
			settings[key] = setting.Value
		}
	}
	apiSecret := settings["proxrad_api_secret"]
	accountUnique := settings["proxrad_account_unique"]
	apiBase := settings["proxrad_api_base"]
	if apiBase == "" {
		apiBase = "http://proxsms.com/api"
	}
	if apiSecret == "" {
		return nil, fmt.Errorf("ProxRad API secret not configured")
	}
	if accountUnique == "" {
		return nil, fmt.Errorf("ProxRad WhatsApp account not linked yet")
	}
	return &ProxRadConfig{
		APISecret:     apiSecret,
		AccountUnique: accountUnique,
		APIBase:       apiBase,
	}, nil
}

// GetConfig retrieves WhatsApp configuration from database
func (s *WhatsAppService) GetConfig() (*WhatsAppConfig, error) {
	settings := make(map[string]string)
	keys := []string{"whatsapp_instance_id", "whatsapp_token", "whatsapp_api_key"}

	for _, key := range keys {
		var setting models.SystemPreference
		if err := database.DB.Where("key = ?", key).First(&setting).Error; err == nil {
			settings[key] = setting.Value
		}
	}

	instanceID := settings["whatsapp_instance_id"]
	token := settings["whatsapp_token"]
	if token == "" {
		token = settings["whatsapp_api_key"] // Legacy field
	}

	if instanceID == "" || token == "" {
		return nil, fmt.Errorf("WhatsApp not configured")
	}

	return &WhatsAppConfig{
		InstanceID: instanceID,
		Token:      token,
	}, nil
}

// CreateProxRadLink calls proxsms.com to create a WhatsApp QR link
// Returns: qrImageURL, token, error
func (s *WhatsAppService) CreateProxRadLink(apiSecret, apiBase string) (string, string, error) {
	if apiBase == "" {
		apiBase = "http://proxsms.com/api"
	}
	reqURL := fmt.Sprintf("%s/create/wa.link?secret=%s", apiBase, url.QueryEscape(apiSecret))
	resp, err := s.client.Get(reqURL)
	if err != nil {
		return "", "", fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Status  int    `json:"status"`
		Message string `json:"message"`
		Data    struct {
			QRImageLink string `json:"qrimagelink"`
			InfoLink    string `json:"infolink"`
			QRString    string `json:"qrstring"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", "", fmt.Errorf("failed to parse response: %v", err)
	}
	if result.Status != 200 {
		return "", "", fmt.Errorf("proxsms error: %s", result.Message)
	}
	// Extract token from infolink URL param
	parsedURL, err := url.Parse(result.Data.InfoLink)
	if err != nil {
		return "", "", fmt.Errorf("failed to parse info link: %v", err)
	}
	token := parsedURL.Query().Get("token")
	return result.Data.QRImageLink, token, nil
}

// GetProxRadLinkStatus polls /get/wa.info to check if WhatsApp is linked
// Returns: unique ID (if linked), phone, error
func (s *WhatsAppService) GetProxRadLinkStatus(token, apiBase string) (string, string, error) {
	if apiBase == "" {
		apiBase = "http://proxsms.com/api"
	}
	reqURL := fmt.Sprintf("%s/get/wa.info?token=%s", apiBase, url.QueryEscape(token))
	resp, err := s.client.Get(reqURL)
	if err != nil {
		return "", "", fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Status  int    `json:"status"`
		Message string `json:"message"`
		Data    struct {
			Unique string `json:"unique"`
			Phone  string `json:"phone"`
			Name   string `json:"name"`
		} `json:"data"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return "", "", fmt.Errorf("failed to parse response: %v", err)
	}
	if result.Status != 200 {
		return "", "", fmt.Errorf("not linked yet")
	}
	return result.Data.Unique, result.Data.Phone, nil
}

// SendMessageViaProxRad sends a WhatsApp message using proxsms.com API
func (s *WhatsAppService) SendMessageViaProxRad(config *ProxRadConfig, to, message string) error {
	reqURL := fmt.Sprintf("%s/send/whatsapp", config.APIBase)

	formData := url.Values{}
	formData.Set("secret", config.APISecret)
	formData.Set("account", config.AccountUnique)
	formData.Set("recipient", to)
	formData.Set("type", "text")
	formData.Set("message", message)
	formData.Set("priority", "1")

	req, err := http.NewRequest("POST", reqURL, strings.NewReader(formData.Encode()))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var result struct {
		Status  int    `json:"status"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(body, &result); err == nil && result.Status != 200 {
		return fmt.Errorf("proxsms error: %s", result.Message)
	}
	if resp.StatusCode >= 400 {
		return fmt.Errorf("proxsms HTTP error (%d): %s", resp.StatusCode, string(body))
	}
	return nil
}

// SendMessage sends a WhatsApp text message (routes to correct provider)
func (s *WhatsAppService) SendMessage(to, message string) error {
	provider := s.getProvider()
	if provider == "proxrad" {
		config, err := s.GetProxRadConfig()
		if err != nil {
			return err
		}
		return s.SendMessageViaProxRad(config, to, message)
	}
	// Default: Ultramsg
	config, err := s.GetConfig()
	if err != nil {
		return err
	}
	return s.SendMessageWithConfig(config, to, message)
}

// SendMessageWithConfig sends a WhatsApp message with specific config
func (s *WhatsAppService) SendMessageWithConfig(config *WhatsAppConfig, to, message string) error {
	apiURL := fmt.Sprintf("https://api.ultramsg.com/%s/messages/chat", config.InstanceID)

	// Format phone number (remove + if present, ensure it has country code)
	to = strings.TrimPrefix(to, "+")

	data := url.Values{}
	data.Set("token", config.Token)
	data.Set("to", to)
	data.Set("body", message)

	req, err := http.NewRequest("POST", apiURL, strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Ultramsg error (%d): %s", resp.StatusCode, string(body))
	}

	// Check response for errors
	var ultramsgResp struct {
		Sent   string `json:"sent"`
		Error  string `json:"error"`
		ID     string `json:"id"`
		Status string `json:"status"`
	}
	if err := json.Unmarshal(body, &ultramsgResp); err == nil {
		if ultramsgResp.Error != "" {
			return fmt.Errorf("Ultramsg error: %s", ultramsgResp.Error)
		}
		if ultramsgResp.Sent == "false" {
			return fmt.Errorf("message not sent: %s", string(body))
		}
	}

	return nil
}

// SendImage sends a WhatsApp image message
func (s *WhatsAppService) SendImage(to, imageURL, caption string) error {
	config, err := s.GetConfig()
	if err != nil {
		return err
	}

	apiURL := fmt.Sprintf("https://api.ultramsg.com/%s/messages/image", config.InstanceID)

	to = strings.TrimPrefix(to, "+")

	data := url.Values{}
	data.Set("token", config.Token)
	data.Set("to", to)
	data.Set("image", imageURL)
	if caption != "" {
		data.Set("caption", caption)
	}

	req, err := http.NewRequest("POST", apiURL, strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Ultramsg error (%d): %s", resp.StatusCode, string(body))
	}

	return nil
}

// SendDocument sends a WhatsApp document
func (s *WhatsAppService) SendDocument(to, documentURL, filename string) error {
	config, err := s.GetConfig()
	if err != nil {
		return err
	}

	apiURL := fmt.Sprintf("https://api.ultramsg.com/%s/messages/document", config.InstanceID)

	to = strings.TrimPrefix(to, "+")

	data := url.Values{}
	data.Set("token", config.Token)
	data.Set("to", to)
	data.Set("document", documentURL)
	if filename != "" {
		data.Set("filename", filename)
	}

	req, err := http.NewRequest("POST", apiURL, strings.NewReader(data.Encode()))
	if err != nil {
		return fmt.Errorf("failed to create request: %v", err)
	}

	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := s.client.Do(req)
	if err != nil {
		return fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Ultramsg error (%d): %s", resp.StatusCode, string(body))
	}

	return nil
}

// TestConnection tests the WhatsApp connection
func (s *WhatsAppService) TestConnection(config *WhatsAppConfig) error {
	if config.InstanceID == "" {
		return fmt.Errorf("Instance ID is required")
	}
	if config.Token == "" {
		return fmt.Errorf("Token is required")
	}

	// Test by getting instance status
	apiURL := fmt.Sprintf("https://api.ultramsg.com/%s/instance/status?token=%s",
		config.InstanceID, config.Token)

	resp, err := s.client.Get(apiURL)
	if err != nil {
		return fmt.Errorf("connection failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode >= 400 {
		return fmt.Errorf("Ultramsg error (%d): %s", resp.StatusCode, string(body))
	}

	// Check response
	var statusResp struct {
		Status struct {
			AccountStatus struct {
				Status string `json:"status"`
			} `json:"accountStatus"`
		} `json:"status"`
		Error string `json:"error"`
	}

	if err := json.Unmarshal(body, &statusResp); err == nil {
		if statusResp.Error != "" {
			return fmt.Errorf("Ultramsg error: %s", statusResp.Error)
		}
	}

	return nil
}

// GetInstanceStatus gets the WhatsApp instance status
func (s *WhatsAppService) GetInstanceStatus(config *WhatsAppConfig) (map[string]interface{}, error) {
	apiURL := fmt.Sprintf("https://api.ultramsg.com/%s/instance/status?token=%s",
		config.InstanceID, config.Token)

	resp, err := s.client.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("request failed: %v", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)

	var result map[string]interface{}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("failed to parse response: %v", err)
	}

	return result, nil
}

// SendTestMessage sends a test WhatsApp message
func (s *WhatsAppService) SendTestMessage(config *WhatsAppConfig, toPhone string) error {
	message := "✅ *ProxPanel Test*\n\nYour WhatsApp configuration is working correctly!\n\nYou can now receive automated notifications."
	return s.SendMessageWithConfig(config, toPhone, message)
}

// SendTemplateMessage sends a formatted message using a template
func (s *WhatsAppService) SendTemplateMessage(to string, template string, data map[string]string) error {
	message := template
	for key, value := range data {
		message = strings.ReplaceAll(message, "{{"+key+"}}", value)
	}
	return s.SendMessage(to, message)
}

// BulkSendMessage sends messages to multiple recipients
func (s *WhatsAppService) BulkSendMessage(recipients []string, message string) ([]error, error) {
	config, err := s.GetConfig()
	if err != nil {
		return nil, err
	}

	errors := make([]error, len(recipients))
	for i, to := range recipients {
		errors[i] = s.SendMessageWithConfig(config, to, message)
		// Add small delay to avoid rate limiting
		time.Sleep(500 * time.Millisecond)
	}

	return errors, nil
}

// UltramsgWebhookPayload represents incoming webhook from Ultramsg
type UltramsgWebhookPayload struct {
	ID        string `json:"id"`
	From      string `json:"from"`
	To        string `json:"to"`
	Body      string `json:"body"`
	Type      string `json:"type"`
	Timestamp string `json:"timestamp"`
	Ack       string `json:"ack"`
}

// ParseWebhook parses incoming webhook payload
func (s *WhatsAppService) ParseWebhook(body []byte) (*UltramsgWebhookPayload, error) {
	var payload UltramsgWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, fmt.Errorf("failed to parse webhook: %v", err)
	}
	return &payload, nil
}
