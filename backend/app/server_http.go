package main

import (
	"net/http"

	httpapi "listen-party/backend/http"
)

func writeJSON(w http.ResponseWriter, v any) {
	httpapi.WriteJSON(w, v)
}

func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	return httpapi.ReadJSON(w, r, v)
}

func writeError(w http.ResponseWriter, err error) {
	httpapi.WriteError(w, err)
}
