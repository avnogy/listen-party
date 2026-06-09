package main

import "testing"

func TestNormalizeSearch(t *testing.T) {
	got := NormalizeSearch(" The_Band - Track  01! ")
	want := "the band track 01"
	if got != want {
		t.Fatalf("NormalizeSearch() = %q, want %q", got, want)
	}
}

func TestIsMP3(t *testing.T) {
	for _, path := range []string{"song.mp3", "SONG.MP3", "/tmp/a.b/song.Mp3"} {
		if !IsMP3(path) {
			t.Fatalf("%q should be accepted", path)
		}
	}
	for _, path := range []string{"song.flac", "mp3.txt", "song"} {
		if IsMP3(path) {
			t.Fatalf("%q should be rejected", path)
		}
	}
}
