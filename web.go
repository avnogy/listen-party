package main

import (
	"embed"
	"io/fs"
)

//go:embed frontend/**
var webFS embed.FS

//go:embed frontend/admin.html frontend/admin/**
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
