package library

import (
	"path/filepath"
	"sort"
	"strings"
)

var audioFormats = map[string]string{
	".mp3":  "audio/mpeg",
	".m4a":  "audio/mp4",
	".m4b":  "audio/mp4",
	".aac":  "audio/aac",
	".flac": "audio/flac",
	".wav":  "audio/wav",
	".aif":  "audio/aiff",
	".aiff": "audio/aiff",
	".ogg":  "audio/ogg",
	".oga":  "audio/ogg",
	".opus": "audio/ogg",
}

func audioMIME(path string) string {
	return audioFormats[strings.ToLower(filepath.Ext(path))]
}

func isSupportedAudio(path string) bool {
	return audioMIME(path) != ""
}

// AudioExtensions supplies the folder picker from the same registry as scanning.
func AudioExtensions() []string {
	extensions := make([]string, 0, len(audioFormats))
	for ext := range audioFormats {
		extensions = append(extensions, ext)
	}
	sort.Strings(extensions)
	return extensions
}
