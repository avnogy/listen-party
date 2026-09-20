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
