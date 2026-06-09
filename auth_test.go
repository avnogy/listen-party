package main

import (
	"net/http/httptest"
	"testing"
)

func TestBasicAuthRoles(t *testing.T) {
	b := NewBasicAuth(AuthConfig{
		Listener: Credentials{Username: "listener", Password: "listen"},
		Admin:    Credentials{Username: "admin", Password: "admin"},
		Rescan:   Credentials{Username: "rescan", Password: "rescan"},
	})

	req := httptest.NewRequest("GET", "/", nil)
	req.SetBasicAuth("admin", "admin")
	if !b.Authorized(req, RoleAdmin) {
		t.Fatal("admin credentials rejected")
	}
	if b.Authorized(req, RoleRescan) {
		t.Fatal("admin credentials accepted for rescan")
	}
}
