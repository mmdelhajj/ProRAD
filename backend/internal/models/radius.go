package models

import (
	"time"
)

// RadCheck represents RADIUS check attributes
type RadCheck struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	Username  string `gorm:"size:64;not null;index" json:"username"`
	Attribute string `gorm:"size:64;not null" json:"attribute"`
	Op        string `gorm:"size:2;not null;default:':='" json:"op"`
	Value     string `gorm:"size:253;not null" json:"value"`
}

// RadReply represents RADIUS reply attributes
type RadReply struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	Username  string `gorm:"size:64;not null;index" json:"username"`
	Attribute string `gorm:"size:64;not null" json:"attribute"`
	Op        string `gorm:"size:2;not null;default:'='" json:"op"`
	Value     string `gorm:"size:253;not null" json:"value"`
}

// RadGroupCheck represents RADIUS group check attributes
type RadGroupCheck struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	GroupName string `gorm:"size:64;not null;index" json:"groupname"`
	Attribute string `gorm:"size:64;not null" json:"attribute"`
	Op        string `gorm:"size:2;not null;default:':='" json:"op"`
	Value     string `gorm:"size:253;not null" json:"value"`
}

// RadGroupReply represents RADIUS group reply attributes
type RadGroupReply struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	GroupName string `gorm:"size:64;not null;index" json:"groupname"`
	Attribute string `gorm:"size:64;not null" json:"attribute"`
	Op        string `gorm:"size:2;not null;default:'='" json:"op"`
	Value     string `gorm:"size:253;not null" json:"value"`
}

// RadUserGroup represents user to group mapping
type RadUserGroup struct {
	ID        uint   `gorm:"primaryKey" json:"id"`
	Username  string `gorm:"size:64;not null;index" json:"username"`
	GroupName string `gorm:"size:64;not null" json:"groupname"`
	Priority  int    `gorm:"default:1" json:"priority"`
}

// RadAcct represents RADIUS accounting records
type RadAcct struct {
	ID                  uint       `gorm:"primaryKey" json:"id"`
	AcctSessionID       string     `gorm:"size:64;not null;index" json:"acctsessionid"`
	AcctUniqueID        string     `gorm:"size:32;uniqueIndex" json:"acctuniqueid"`
	Username            string     `gorm:"size:64;not null;index" json:"username"`
	Realm               string     `gorm:"size:64" json:"realm"`
	NasIPAddress        string     `gorm:"size:15;not null;index" json:"nasipaddress"`
	NasPortID           string     `gorm:"size:50" json:"nasportid"`
	NasPortType         string     `gorm:"size:32" json:"nasporttype"`
	AcctStartTime       *time.Time `gorm:"index" json:"acctstarttime"`
	AcctUpdateTime      *time.Time `json:"acctupdatetime"`
	AcctStopTime        *time.Time `gorm:"index" json:"acctstoptime"`
	AcctSessionTime     int        `gorm:"default:0" json:"acctsessiontime"`
	AcctAuthentic       string     `gorm:"size:32" json:"acctauthentic"`
	ConnectInfoStart    string     `gorm:"size:50" json:"connectinfo_start"`
	ConnectInfoStop     string     `gorm:"size:50" json:"connectinfo_stop"`
	AcctInputOctets     int64      `gorm:"default:0" json:"acctinputoctets"`
	AcctOutputOctets    int64      `gorm:"default:0" json:"acctoutputoctets"`
	CalledStationID     string     `gorm:"size:50" json:"calledstationid"`
	CallingStationID    string     `gorm:"size:50;index" json:"callingstationid"` // MAC Address
	AcctTerminateCause  string     `gorm:"size:32" json:"acctterminatecause"`
	ServiceType         string     `gorm:"size:32" json:"servicetype"`
	FramedProtocol      string     `gorm:"size:32" json:"framedprotocol"`
	FramedIPAddress     string     `gorm:"size:15;index" json:"framedipaddress"`
	FramedIPv6Address   string     `gorm:"size:45" json:"framedipv6address"`
	FramedIPv6Prefix    string     `gorm:"size:45" json:"framedipv6prefix"`
	FramedInterfaceID   string     `gorm:"size:44" json:"framedinterfaceid"`
	DelegatedIPv6Prefix string     `gorm:"size:45" json:"delegatedipv6prefix"`
}

// RadPostAuth represents post-authentication logs
type RadPostAuth struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	Username      string    `gorm:"size:64;not null;index" json:"username"`
	Pass          string    `gorm:"size:64" json:"pass"`
	Reply         string    `gorm:"size:32" json:"reply"`
	CallingStationID string `gorm:"size:50" json:"callingstationid"`
	AuthDate      time.Time `gorm:"autoCreateTime;index" json:"authdate"`
}

func (RadCheck) TableName() string {
	return "radcheck"
}

func (RadReply) TableName() string {
	return "radreply"
}

func (RadGroupCheck) TableName() string {
	return "radgroupcheck"
}

func (RadGroupReply) TableName() string {
	return "radgroupreply"
}

func (RadUserGroup) TableName() string {
	return "radusergroup"
}

func (RadAcct) TableName() string {
	return "radacct"
}

func (RadPostAuth) TableName() string {
	return "radpostauth"
}
