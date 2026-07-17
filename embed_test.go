package main

import (
	"testing"
	"io/fs"
)

func TestWebEmbed(t *testing.T) {
	webFS := webRoot()
	files := []string{
		"app/features/queue/index.js",
		"app/features/room/index.js",
		"app/features/playback/index.js",
		"app/features/playlists/index.js",
		"app/features/events/index.js",
		"app/features/library/index.js",
		"app/bootstrap.js",
		"index.html",
		"style.css",
	}
	for _, f := range files {
		_, err := fs.Stat(webFS, f)
		if err != nil {
			t.Errorf("missing %s: %v", f, err)
		}
	}
}
