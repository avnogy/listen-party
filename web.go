package main

import (
	"embed"
	"io/fs"
)

//go:embed index.html style.css app.js
var webFS embed.FS

func webRoot() fs.FS {
	return webFS
}
