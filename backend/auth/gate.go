package auth

import (
	"net/http"

	appauth "listen-party/backend/internal/auth"
)

type Gate interface {
	Authorized(r *http.Request, roles ...appauth.Role) bool
	CurrentUser(r *http.Request) (appauth.UserInfo, bool)
	ListEnabledUsers() ([]appauth.UserSummary, error)
	Require(roles ...appauth.Role) func(http.Handler) http.Handler
}

// These names keep the application test fixtures concise while the production
// interface above remains explicitly typed against internal/auth.
type Role = appauth.Role
type UserInfo = appauth.UserInfo
type UserSummary = appauth.UserSummary

const RoleAdmin = appauth.RoleAdmin
