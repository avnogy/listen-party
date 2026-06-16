package library_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	musiclib "listen-party/internal/library"
)

func TestArtworkReadsEmbeddedPicture(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "with-art.mp3")
	want := []byte{0xff, 0xd8, 0xff, 0xd9}
	if err := os.WriteFile(path, id3v23PictureTag(want), 0o644); err != nil {
		t.Fatalf("write mp3: %v", err)
	}

	lib, err := musiclib.Open(ctx, filepath.Join(t.TempDir(), "tracks.sqlite"), []string{dir}, 1)
	if err != nil {
		t.Fatalf("open library: %v", err)
	}
	defer lib.Close()
	if err := lib.Scan(ctx); err != nil {
		t.Fatalf("scan: %v", err)
	}
	tracks, err := lib.Search(ctx, "with art")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	got, mimeType, err := lib.Artwork(ctx, tracks[0].ID)
	if err != nil {
		t.Fatalf("artwork: %v", err)
	}
	if mimeType != "image/jpeg" || string(got) != string(want) {
		t.Fatalf("artwork = %q %v, want image/jpeg %v", mimeType, got, want)
	}
}

func TestScanIndexesFilenameFallbackAndSearch(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "Alex Clare - Too Close [zP5OEwh31E4].mp3")
	if err := os.WriteFile(path, []byte("not really mp3"), 0o644); err != nil {
		t.Fatalf("write mp3: %v", err)
	}

	lib, err := musiclib.Open(ctx, filepath.Join(t.TempDir(), "tracks.sqlite"), []string{dir}, 1)
	if err != nil {
		t.Fatalf("open library: %v", err)
	}
	defer lib.Close()
	if err := lib.Scan(ctx); err != nil {
		t.Fatalf("scan: %v", err)
	}

	tracks, err := lib.Search(ctx, "too-close")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(tracks) != 1 {
		t.Fatalf("search returned %d tracks, want 1", len(tracks))
	}
	if tracks[0].Title != "Too Close" || tracks[0].Artist != "Alex Clare" {
		t.Fatalf("track = %q/%q, want Too Close/Alex Clare", tracks[0].Title, tracks[0].Artist)
	}
}

func TestSearchOrdersByTitleAscending(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	for _, name := range []string{"Mix - Zeta.mp3", "Mix - alpha.mp3", "Mix - Middle.mp3"} {
		if err := os.WriteFile(filepath.Join(dir, name), []byte("not really mp3"), 0o644); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	lib, err := musiclib.Open(ctx, filepath.Join(t.TempDir(), "tracks.sqlite"), []string{dir}, 1)
	if err != nil {
		t.Fatalf("open library: %v", err)
	}
	defer lib.Close()

	if err := lib.Scan(ctx); err != nil {
		t.Fatalf("scan: %v", err)
	}
	tracks, err := lib.Search(ctx, "mix")
	if err != nil {
		t.Fatalf("search: %v", err)
	}
	if len(tracks) != 3 {
		t.Fatalf("search returned %d tracks, want 3", len(tracks))
	}
	got := []string{tracks[0].Title, tracks[1].Title, tracks[2].Title}
	want := []string{"alpha", "Middle", "Zeta"}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("search order = %#v, want %#v", got, want)
		}
	}
}

func TestScanSkipsUnchangedFiles(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	path := filepath.Join(dir, "same.mp3")
	if err := os.WriteFile(path, []byte("not really mp3"), 0o644); err != nil {
		t.Fatalf("write mp3: %v", err)
	}

	lib, err := musiclib.Open(ctx, filepath.Join(t.TempDir(), "tracks.sqlite"), []string{dir}, 1)
	if err != nil {
		t.Fatalf("open library: %v", err)
	}
	defer lib.Close()
	if err := lib.Scan(ctx); err != nil {
		t.Fatalf("scan: %v", err)
	}

	if err := lib.Scan(ctx); err != nil {
		t.Fatalf("rescan: %v", err)
	}
	if status := lib.ScanStatus(); status.Unchanged != 1 {
		t.Fatalf("unchanged = %d, want 1", status.Unchanged)
	}
}

func TestScanDeletesMissingTracksAfterSuccessfulWalk(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	keepPath := filepath.Join(dir, "keep.mp3")
	removePath := filepath.Join(dir, "remove.mp3")
	for _, path := range []string{keepPath, removePath} {
		if err := os.WriteFile(path, []byte("not really mp3"), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	lib, err := musiclib.Open(ctx, filepath.Join(t.TempDir(), "tracks.sqlite"), []string{dir}, 1)
	if err != nil {
		t.Fatalf("open library: %v", err)
	}
	defer lib.Close()
	if err := lib.Scan(ctx); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if err := os.Remove(removePath); err != nil {
		t.Fatalf("remove mp3: %v", err)
	}
	if err := lib.Scan(ctx); err != nil {
		t.Fatalf("rescan: %v", err)
	}
	count, err := lib.Count(ctx)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("count after delete = %d, want 1", count)
	}
}

func id3v23PictureTag(image []byte) []byte {
	body := append([]byte{0, 'i', 'm', 'a', 'g', 'e', '/', 'j', 'p', 'e', 'g', 0, 3, 0}, image...)
	frame := []byte{'A', 'P', 'I', 'C', byte(len(body) >> 24), byte(len(body) >> 16), byte(len(body) >> 8), byte(len(body)), 0, 0}
	frame = append(frame, body...)
	size := len(frame)
	return append([]byte{'I', 'D', '3', 3, 0, 0, byte(size >> 21), byte(size >> 14), byte(size >> 7), byte(size)}, frame...)
}

func TestScanSkipsIgnoredDirectories(t *testing.T) {
	ctx := context.Background()
	dir := t.TempDir()
	visiblePath := filepath.Join(dir, "visible.mp3")
	hiddenDir := filepath.Join(dir, ".git")
	hiddenPath := filepath.Join(hiddenDir, "hidden.mp3")
	nodeDir := filepath.Join(dir, "node_modules")
	nodePath := filepath.Join(nodeDir, "dependency.mp3")
	for _, path := range []string{hiddenDir, nodeDir} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}
	for _, path := range []string{visiblePath, hiddenPath, nodePath} {
		if err := os.WriteFile(path, []byte("not really mp3"), 0o644); err != nil {
			t.Fatalf("write %s: %v", path, err)
		}
	}

	lib, err := musiclib.Open(ctx, filepath.Join(t.TempDir(), "tracks.sqlite"), []string{dir}, 1)
	if err != nil {
		t.Fatalf("open library: %v", err)
	}
	defer lib.Close()
	if err := lib.Scan(ctx); err != nil {
		t.Fatalf("scan: %v", err)
	}
	count, err := lib.Count(ctx)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if count != 1 {
		t.Fatalf("count = %d, want 1", count)
	}
}
