package auth

import (
	"net/http"
	"path/filepath"
	"strings"
)

const defaultBootstrapAdminEmail = "admin@listen-party.local"

type Role string

const RoleAdmin Role = "admin"

type UserInfo struct {
	ID          string   `json:"id"`
	Username    string   `json:"username"`
	DisplayName string   `json:"display_name,omitempty"`
	Role        Role     `json:"role,omitempty"`
	Groups      []string `json:"groups"`
	SessionKey  string   `json:"-"`
}

type UserSummary struct {
	ID          string `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name,omitempty"`
}

type Config struct {
	DataDir             string     `json:"-"`
	BootstrapAdminEmail string     `json:"-"`
	Keycloak            OIDCConfig `json:"keycloak"`
}

type OIDCConfig struct {
	Enabled      bool   `json:"enabled"`
	IssuerURL    string `json:"issuer_url"`
	ClientID     string `json:"client_id"`
	ClientSecret string `json:"client_secret"`
	DisplayName  string `json:"display_name"`
}

func DataDir(configDir string) string { return filepath.Join(configDir, "auth") }

func DefaultBootstrapAdminEmail() string { return defaultBootstrapAdminEmail }

func DefaultConfig(configDir string) Config {
	return Config{DataDir: DataDir(configDir), BootstrapAdminEmail: defaultBootstrapAdminEmail}
}

func (u UserInfo) Display() string {
	if name := strings.TrimSpace(u.DisplayName); name != "" {
		return name
	}
	return strings.TrimSpace(u.Username)
}

type Gate interface {
	Authorized(r *http.Request, roles ...Role) bool
	CurrentUser(r *http.Request) (UserInfo, bool)
	ListEnabledUsers() ([]UserSummary, error)
	Require(roles ...Role) func(http.Handler) http.Handler
}
