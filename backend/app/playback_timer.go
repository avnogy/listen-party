package main

import (
	"context"
	"errors"
	"log/slog"
	"time"

	musiclib "listen-party/backend/internal/library"
	"listen-party/backend/playback"
	"listen-party/backend/rooms"
)

// stabilizeAndSchedulePlayback resolves the current media before arming its
// timer. Missing tracks are skipped instead of wedging a room.
func (s *Server) stabilizeAndSchedulePlayback(ctx context.Context, room *rooms.Room, state playback.PlaybackState) playback.PlaybackState {
	if s.Library == nil || room == nil {
		return state
	}
	ctx = context.WithoutCancel(ctx)
	for state.Current.DedupeKey != "" && !state.Paused {
		if room.Playback.EndTimerMatches(state.Current.DedupeKey, state.StartedAt) {
			return state
		}
		track, err := s.Library.ResolveDedupeKey(ctx, state.Current.DedupeKey)
		if err == nil && track.DurationMS <= 0 {
			<-s.Library.EnsureDuration(track.ID)
			track, err = s.Library.ResolveDedupeKey(ctx, state.Current.DedupeKey)
		}
		unavailable := err == nil && track.DurationMS <= 0
		if err == nil && !unavailable {
			media, openErr := s.Library.OpenMedia(ctx, track.ID)
			unavailable = openErr != nil
			if media != nil {
				media.Close()
			}
		}
		if err == nil && !unavailable {
			remaining := time.Duration(track.DurationMS)*time.Millisecond - time.Since(state.StartedAt)
			if remaining > 0 {
				key, startedAt := state.Current.DedupeKey, state.StartedAt
				room.Playback.ScheduleEnd(remaining, key, startedAt, func() {
					s.advanceScheduledPlayback(room.ID, key, startedAt)
				})
				return state
			}
		} else if err != nil && !errors.Is(err, musiclib.ErrTrackNotFound) {
			slog.Warn("resolve playback timer media", "room", room.ID, "dedupe_key", state.Current.DedupeKey, "error", err)
			room.Playback.CancelEndTimer()
			return state
		}

		key := state.Current.DedupeKey
		if err := s.prepareAutoDJ(ctx, room); err != nil {
			slog.Warn("prepare auto-dj while advancing playback", "room", room.ID, "error", err)
		}
		if unavailable || err != nil {
			slog.Warn("discarding unavailable playback media", "room", room.ID, "dedupe_key", key)
			var discarded bool
			state, discarded = room.Playback.Discard(key)
			if discarded {
				state = room.Playback.AddAction(playback.RoomAction{Username: "System", Text: "Removed an unavailable track."})
			}
		} else {
			state = room.Playback.Ended(key)
		}
		s.replenishAutoDJ(ctx, room)
	}
	room.Playback.CancelEndTimer()
	return state
}

func (s *Server) advanceScheduledPlayback(roomID, dedupeKey string, startedAt time.Time) {
	room, ok := s.Rooms.Get(roomID)
	if !ok {
		return
	}
	if err := s.prepareAutoDJ(context.Background(), room); err != nil {
		slog.Warn("prepare auto-dj at playback end", "room", room.ID, "error", err)
	}
	state, advanced := room.Playback.EndScheduled(dedupeKey, startedAt)
	if !advanced {
		return
	}
	s.replenishAutoDJ(context.Background(), room)
	s.stabilizeAndSchedulePlayback(context.Background(), room, state)
	if err := s.savePlayback(context.Background(), room); err != nil {
		slog.Error("save scheduled playback state", "room", room.ID, "error", err)
	}
}
