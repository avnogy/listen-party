package httpapi

import (
	"encoding/json"
	"errors"
	"net/http"

	musiclib "listen-party/backend/internal/library"
)

func WriteJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
	}
}

func ReadJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		http.Error(w, "invalid JSON", http.StatusBadRequest)
		return false
	}
	return true
}

func WriteError(w http.ResponseWriter, err error) {
	if errors.Is(err, musiclib.ErrTrackNotFound) || errors.Is(err, musiclib.ErrPlaylistNotFound) {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	http.Error(w, err.Error(), http.StatusInternalServerError)
}
