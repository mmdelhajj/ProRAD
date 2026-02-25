package models

const (
	CloudTierFree       = "free"
	CloudTierBasic      = "basic"
	CloudTierPro        = "pro"
	CloudTierEnterprise = "enterprise"

	CloudQuotaFree       = int64(524288000)    // 500 MB
	CloudQuotaBasic      = int64(5368709120)   // 5 GB
	CloudQuotaPro        = int64(21474836480)  // 20 GB
	CloudQuotaEnterprise = int64(107374182400) // 100 GB

	CloudExpiryFreeDays = 30
	CloudExpiryPaidDays = 90
)
