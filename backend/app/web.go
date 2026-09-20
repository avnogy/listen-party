package main

import (
	"io/fs"

	assets "listen-party"
)

func webRoot() fs.FS { return assets.WebRoot() }

func adminRoot() fs.FS { return assets.AdminRoot() }
