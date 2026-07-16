package main

import (
	"embed"
	"io/fs"
)

// Keep the browser asset set declarative but broad: adding a small feature
// script should not require remembering to update this list as well.
// The application still has no frontend build step; Go embeds the source
// files directly into the binary.
//
//go:embed frontend/index.html frontend/style.css frontend/app.js frontend/app/*.js frontend/shared/*.js frontend/admin/*.js frontend/vendor/*
var webFS embed.FS

//go:embed frontend/admin.html frontend/admin.js frontend/admin/*.js
var adminFS embed.FS

func webRoot() fs.FS {
	root, err := fs.Sub(webFS, "frontend")
	if err != nil {
		panic(err)
	}
	return root
}

func adminRoot() fs.FS {
	root, err := fs.Sub(adminFS, "frontend")
	if err != nil {
		panic(err)
	}
	return root
}
