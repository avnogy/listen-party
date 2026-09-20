package assets

import (
	"embed"
	"io/fs"
)

//go:embed frontend/index.html frontend/style.css frontend/styles/*.css frontend/app.js frontend/app/*.js frontend/vendor/* frontend/favicon.ico
var WebFS embed.FS

//go:embed frontend/admin.html frontend/admin.js frontend/admin/*.js
var AdminFS embed.FS

func WebRoot() fs.FS {
	root, err := fs.Sub(WebFS, "frontend")
	if err != nil {
		panic(err)
	}
	return root
}

func AdminRoot() fs.FS {
	root, err := fs.Sub(AdminFS, "frontend")
	if err != nil {
		panic(err)
	}
	return root
}
