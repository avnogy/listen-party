package main

import "testing"

func TestQueueStartsFirstTrackAndSkipAdvances(t *testing.T) {
	p := NewPlayback("default")
	state := p.Add("default", 10)
	if state.CurrentTrackID != 10 {
		t.Fatalf("current = %d, want 10", state.CurrentTrackID)
	}
	state = p.Add("default", 20)
	if len(state.Queue) != 1 {
		t.Fatalf("queue length = %d, want 1", len(state.Queue))
	}
	state = p.Skip("default")
	if state.CurrentTrackID != 20 {
		t.Fatalf("current after skip = %d, want 20", state.CurrentTrackID)
	}
}

func TestSeekUpdatesSharedPosition(t *testing.T) {
	p := NewPlayback("default")
	p.Add("default", 10)

	state := p.Seek("default", 30_000)
	if state.CurrentTrackID != 10 {
		t.Fatalf("current = %d, want 10", state.CurrentTrackID)
	}
	if state.StartedAt.IsZero() {
		t.Fatal("started_at should be set")
	}

	state = p.Pause("default")
	state = p.Seek("default", 12_000)
	if state.PositionAtPauseMS != 12_000 {
		t.Fatalf("pause position = %d, want 12000", state.PositionAtPauseMS)
	}
}

func TestQueueRemoveAndClear(t *testing.T) {
	p := NewPlayback("default")
	p.Add("default", 10)
	state := p.Add("default", 20)
	if len(state.Queue) != 1 {
		t.Fatalf("queue length = %d, want 1", len(state.Queue))
	}

	state = p.Remove("default", state.Queue[0].ID)
	if len(state.Queue) != 0 {
		t.Fatalf("queue length after remove = %d, want 0", len(state.Queue))
	}

	p.Add("default", 30)
	p.Add("default", 40)
	state = p.Clear("default")
	if len(state.Queue) != 0 {
		t.Fatalf("queue length after clear = %d, want 0", len(state.Queue))
	}
	if state.CurrentTrackID != 10 {
		t.Fatalf("current track = %d, want 10", state.CurrentTrackID)
	}
}

func TestEndedOnlyAdvancesMatchingCurrentTrack(t *testing.T) {
	p := NewPlayback("default")
	p.Add("default", 10)
	p.Add("default", 20)
	p.Add("default", 30)

	state := p.Ended("default", 10)
	if state.CurrentTrackID != 20 {
		t.Fatalf("current after ended = %d, want 20", state.CurrentTrackID)
	}
	state = p.Ended("default", 10)
	if state.CurrentTrackID != 20 {
		t.Fatalf("stale ended advanced current to %d, want 20", state.CurrentTrackID)
	}
}

func TestPlaybackIDChangesForEachStartedTrack(t *testing.T) {
	p := NewPlayback("default")
	first := p.Add("default", 10)
	p.Add("default", 10)
	second := p.Skip("default")

	if first.PlaybackID == 0 {
		t.Fatal("first playback id should be set")
	}
	if second.PlaybackID <= first.PlaybackID {
		t.Fatalf("second playback id = %d, want greater than %d", second.PlaybackID, first.PlaybackID)
	}
	if second.CurrentTrackID != 10 {
		t.Fatalf("current = %d, want same track id 10", second.CurrentTrackID)
	}
}
