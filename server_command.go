package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"strings"
)

import musiclib "listen-party/internal/library"

func (s *Server) handleCommand(w http.ResponseWriter, r *http.Request) {
	room, user, ok := s.roomFromRequest(w, r)
	if !ok {
		return
	}
	var req struct {
		Action            string       `json:"action"`
		DedupeKey         string       `json:"dedupe_key"`
		QueueItemID       int64        `json:"queue_item_id"`
		BeforeQueueItemID int64        `json:"before_queue_item_id"`
		PositionMS        int64        `json:"position_ms"`
		Enabled           bool         `json:"enabled"`
		Source            AutoDJSource `json:"source"`
		Volume            float64      `json:"volume"`
		Muted             bool         `json:"muted"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	permission, known := permissionForAction(req.Action)
	if !known {
		http.Error(w, "unknown action", http.StatusBadRequest)
		return
	}
	if !s.Rooms.UserHasPermission(room.ID, user, permission) {
		http.Error(w, "room permission denied", http.StatusForbidden)
		return
	}
	displayName := user.Display()
	switch req.Action {
	case "auto_dj":
		if !req.Enabled {
			s.writeCommandState(w, r, "auto_dj_disable", room, displayName, room.Playback.ConfigureAutoDJ(false, "", nil))
			return
		}
		config, _ := room.Playback.AutoDJConfiguration()
		candidate, entries, err := s.newAutoDJCycle(r.Context(), config.Source)
		if err != nil {
			writeError(w, err)
			return
		}
		state, configured := room.Playback.ConfigureAutoDJForSource(config.Source, true, candidate, entries)
		if !configured {
			http.Error(w, "shuffle source changed; retry", http.StatusConflict)
			return
		}
		s.writeCommandState(w, r, "auto_dj_enable", room, displayName, state)
	case "auto_dj_source":
		source, err := s.resolveAutoDJSource(r.Context(), req.Source)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		config, _ := room.Playback.AutoDJConfiguration()
		if !config.Enabled {
			var available bool
			if source.Type == AutoDJSourceLibrary {
				count, err := s.Library.Count(r.Context())
				if err != nil {
					writeError(w, err)
					return
				}
				available = count > 0
			} else {
				entries, err := s.Library.PlaylistShuffleItemIDs(r.Context(), source.PlaylistID)
				if err != nil {
					writeError(w, err)
					return
				}
				available = len(entries) > 0
			}
			if !available {
				http.Error(w, "shuffle source contains no available tracks", http.StatusConflict)
				return
			}
			s.writeCommandState(w, r, "auto_dj_source", room, displayName, room.Playback.ConfigureAutoDJSource(source, "", nil))
			return
		}
		candidate, entries, err := s.newAutoDJCycle(r.Context(), source)
		if err != nil {
			writeError(w, err)
			return
		}
		s.writeCommandState(w, r, "auto_dj_source", room, displayName, room.Playback.ConfigureAutoDJSource(source, candidate, entries))
	case "queue_add":
		if req.DedupeKey == "" {
			http.Error(w, "dedupe_key is required", http.StatusBadRequest)
			return
		}
		track, err := s.Library.ResolveDedupeKey(r.Context(), req.DedupeKey)
		if err != nil {
			writeError(w, err)
			return
		}
		if track.DurationMS <= 0 {
			s.Library.EnsureDuration(track.ID)
		}
		state, err := room.Playback.Add(req.DedupeKey, displayName)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		s.writeCommandState(w, r, "queue_add", room, displayName, state)
	case "queue_remove":
		if req.QueueItemID <= 0 {
			http.Error(w, "queue_item_id is required", http.StatusBadRequest)
			return
		}
		before := room.Playback.Snapshot()
		removed, ok := queueItemByID(before.Queue, req.QueueItemID)
		state := room.Playback.Remove(req.QueueItemID)
		if ok && len(state.Queue) != len(before.Queue) {
			state = s.recordRoomAction(r, room, displayName, fmt.Sprintf("Removed %q from the queue.", s.trackActionName(r.Context(), removed.DedupeKey)))
		}
		s.writeCommandState(w, r, "queue_remove", room, displayName, state)
	case "queue_reorder":
		if req.QueueItemID <= 0 {
			http.Error(w, "queue_item_id is required", http.StatusBadRequest)
			return
		}
		if req.BeforeQueueItemID < 0 {
			http.Error(w, "before_queue_item_id must not be negative", http.StatusBadRequest)
			return
		}
		before := room.Playback.Snapshot()
		moved, movedOK := queueItemByID(before.Queue, req.QueueItemID)
		target, targetOK := queueItemByID(before.Queue, req.BeforeQueueItemID)
		state, err := room.Playback.Reorder(req.QueueItemID, req.BeforeQueueItemID)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		if movedOK && queueOrderChanged(before.Queue, state.Queue) {
			movedName := s.trackActionName(r.Context(), moved.DedupeKey)
			if req.BeforeQueueItemID == 0 {
				state = s.recordRoomAction(r, room, displayName, fmt.Sprintf("Moved %q to the end of the queue.", movedName))
			} else if targetOK {
				state = s.recordRoomAction(r, room, displayName, fmt.Sprintf("Moved %q before %q in the queue.", movedName, s.trackActionName(r.Context(), target.DedupeKey)))
			}
		}
		s.writeCommandState(w, r, "queue_reorder", room, displayName, state)
	case "queue_clear":
		before := room.Playback.Snapshot()
		state := room.Playback.Clear()
		if len(before.Queue) > 0 {
			state = s.recordRoomAction(r, room, displayName, "Cleared the queue.")
		}
		s.writeCommandState(w, r, "queue_clear", room, displayName, state)
	case "play":
		state, err := room.Playback.Play()
		if err != nil {
			slog.Warn("play rejected", "remote", r.RemoteAddr, "room", room.ID, "error", err)
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		s.writeCommandState(w, r, "play", room, displayName, state)
	case "play_now":
		if req.DedupeKey == "" {
			http.Error(w, "dedupe_key is required", http.StatusBadRequest)
			return
		}
		track, err := s.Library.ResolveDedupeKey(r.Context(), req.DedupeKey)
		if err != nil {
			writeError(w, err)
			return
		}
		if track.DurationMS <= 0 {
			s.Library.EnsureDuration(track.ID)
		}
		before := room.Playback.Snapshot()
		state := room.Playback.PlayNow(req.DedupeKey, displayName)
		if before.Current.DedupeKey != "" {
			state = s.recordRoomAction(r, room, displayName, fmt.Sprintf("Played %q now, replacing %q.", trackActionTitle(track), s.trackActionName(r.Context(), before.Current.DedupeKey)))
		}
		s.writeCommandState(w, r, "play_now", room, displayName, state)
	case "pause":
		s.writeCommandState(w, r, "pause", room, displayName, room.Playback.Pause())
	case "room_audio":
		if req.Volume < 0 || req.Volume > maxRoomVolume {
			http.Error(w, "volume must be between 0 and 0.5", http.StatusBadRequest)
			return
		}
		s.writeCommandState(w, r, "room_audio", room, displayName, room.Playback.SetRoomAudio(req.Volume, req.Muted))
	case "previous":
		s.writeCommandState(w, r, "previous", room, displayName, room.Playback.Previous())
	case "seek":
		s.writeCommandState(w, r, "seek", room, displayName, room.Playback.SeekTo(req.PositionMS))
	case "skip":
		before := room.Playback.Snapshot()
		if err := s.prepareAutoDJ(r.Context(), room); err != nil {
			writeError(w, err)
			return
		}
		state := room.Playback.Skip()
		s.replenishAutoDJ(r.Context(), room)
		if before.Current.DedupeKey != "" {
			state = s.recordRoomAction(r, room, displayName, s.skipActionText(r.Context(), before.Current.DedupeKey, state.Current.DedupeKey))
		}
		s.writeCommandState(w, r, "skip", room, displayName, state)
	case "history_clear":
		s.writeCommandState(w, r, "history_clear", room, displayName, room.Playback.ClearHistory())
	}
}

func queueItemByID(queue []PlaybackItem, id int64) (PlaybackItem, bool) {
	if id <= 0 {
		return PlaybackItem{}, false
	}
	for _, item := range queue {
		if item.ID == id {
			return item, true
		}
	}
	return PlaybackItem{}, false
}

func queueOrderChanged(before, after []PlaybackItem) bool {
	if len(before) != len(after) {
		return true
	}
	for i := range before {
		if before[i].ID != after[i].ID {
			return true
		}
	}
	return false
}

func (s *Server) recordRoomAction(r *http.Request, room *Room, username, text string) PlaybackState {
	ip := ""
	if parsedIP, ok := clientIP(r.RemoteAddr); ok {
		ip = parsedIP.String()
	}
	return room.Playback.AddAction(RoomAction{
		IP:       ip,
		Username: username,
		Text:     text,
	})
}

func (s *Server) skipActionText(ctx context.Context, previousKey, _ string) string {
	previousName := s.trackActionName(ctx, previousKey)
	return fmt.Sprintf("Skipped %q.", previousName)
}

func (s *Server) trackActionName(ctx context.Context, dedupeKey string) string {
	if dedupeKey == "" || s.Library == nil {
		return "Unavailable track"
	}
	track, err := s.Library.ResolveDedupeKey(ctx, dedupeKey)
	if err != nil {
		return "Unavailable track"
	}
	return trackActionTitle(track)
}

func trackActionTitle(track musiclib.Track) string {
	title := strings.TrimSpace(track.Title)
	if title == "" {
		return "Track"
	}
	return title
}

func permissionForAction(action string) (RoomPermission, bool) {
	switch action {
	case "queue_add":
		return PermissionQueueAdd, true
	case "queue_remove", "queue_reorder", "queue_clear", "history_clear", "auto_dj", "auto_dj_source":
		return PermissionQueueManage, true
	case "play", "play_now", "pause", "previous", "seek", "skip":
		return PermissionPlaybackControl, true
	case "room_audio":
		return PermissionVolumeControl, true
	default:
		return "", false
	}
}

func (s *Server) prepareAutoDJ(ctx context.Context, room *Room) error {
	config, candidate := room.Playback.AutoDJConfiguration()
	if !config.Enabled {
		return nil
	}
	if candidate != "" {
		if _, err := s.Library.ResolveDedupeKey(ctx, candidate); err == nil {
			return nil
		} else if !errors.Is(err, musiclib.ErrTrackNotFound) {
			return err
		}
		if !room.Playback.ClearAutoDJCandidate(config.Source) {
			return nil
		}
	}
	_, err := s.prepareAutoDJCandidate(ctx, room, config.Source)
	if errors.Is(err, musiclib.ErrTrackNotFound) {
		room.Playback.ConfigureAutoDJ(false, "", nil)
		return nil
	}
	if errors.Is(err, errAutoDJConfigurationChanged) {
		return nil
	}
	if err != nil {
		return err
	}
	return nil
}

func (s *Server) replenishAutoDJ(ctx context.Context, room *Room) {
	config, candidate := room.Playback.AutoDJConfiguration()
	if !config.Enabled || candidate != "" {
		return
	}
	_, err := s.prepareAutoDJCandidate(ctx, room, config.Source)
	if err != nil {
		if errors.Is(err, errAutoDJConfigurationChanged) {
			return
		}
		slog.Warn("prepare next auto-dj track", "room", room.ID, "error", err)
		if errors.Is(err, musiclib.ErrTrackNotFound) || errors.Is(err, musiclib.ErrPlaylistNotFound) {
			room.Playback.ConfigureAutoDJ(false, "", nil)
		}
		return
	}
}

func (s *Server) newAutoDJCycle(ctx context.Context, source AutoDJSource) (string, []int64, error) {
	entries, err := s.autoDJEntries(ctx, source)
	if err != nil {
		return "", nil, err
	}
	if len(entries) == 0 {
		return "", nil, musiclib.ErrTrackNotFound
	}
	rand.Shuffle(len(entries), func(i, j int) { entries[i], entries[j] = entries[j], entries[i] })
	return s.resolveAutoDJEntries(ctx, source, entries)
}

func (s *Server) autoDJEntries(ctx context.Context, source AutoDJSource) ([]int64, error) {
	if source.Type == AutoDJSourcePlaylist {
		return s.Library.PlaylistShuffleItemIDs(ctx, source.PlaylistID)
	}
	return s.Library.ShuffleTrackIDs(ctx)
}

func (s *Server) nextAutoDJCandidate(ctx context.Context, room *Room, source AutoDJSource) (string, error) {
	for {
		entry, ok := room.Playback.TakeAutoDJEntry(source)
		if ok {
			track, err := s.resolveAutoDJEntry(ctx, source, entry)
			if errors.Is(err, musiclib.ErrTrackNotFound) {
				continue
			}
			if err != nil {
				return "", err
			}
			return track.DedupeKey, nil
		}
		entries, err := s.autoDJEntries(ctx, source)
		if err != nil {
			return "", err
		}
		if len(entries) == 0 {
			return "", musiclib.ErrTrackNotFound
		}
		rand.Shuffle(len(entries), func(i, j int) { entries[i], entries[j] = entries[j], entries[i] })
		if room.Playback.RefillAutoDJEntries(source, entries) {
			continue
		}
		config, _ := room.Playback.AutoDJConfiguration()
		if !config.Enabled || config.Source != source {
			return "", errAutoDJConfigurationChanged
		}
	}
}

func (s *Server) prepareAutoDJCandidate(ctx context.Context, room *Room, source AutoDJSource) (string, error) {
	if !room.Playback.BeginAutoDJCandidate(source) {
		return "", errAutoDJConfigurationChanged
	}
	candidate, err := s.nextAutoDJCandidate(ctx, room, source)
	if err != nil {
		room.Playback.CompleteAutoDJCandidate(source, "")
		return "", err
	}
	if !room.Playback.CompleteAutoDJCandidate(source, candidate) {
		return "", errAutoDJConfigurationChanged
	}
	return candidate, nil
}

func (s *Server) resolveAutoDJEntries(ctx context.Context, source AutoDJSource, entries []int64) (string, []int64, error) {
	for len(entries) > 0 {
		last := len(entries) - 1
		entry := entries[last]
		entries = entries[:last]
		track, err := s.resolveAutoDJEntry(ctx, source, entry)
		if errors.Is(err, musiclib.ErrTrackNotFound) {
			continue
		}
		if err != nil {
			return "", nil, err
		}
		return track.DedupeKey, entries, nil
	}
	return "", nil, musiclib.ErrTrackNotFound
}

func (s *Server) resolveAutoDJEntry(ctx context.Context, source AutoDJSource, entry int64) (musiclib.Track, error) {
	if source.Type == AutoDJSourcePlaylist {
		return s.Library.PlaylistItemTrack(ctx, source.PlaylistID, entry)
	}
	return s.Library.GetCached(ctx, entry)
}

func (s *Server) resolveAutoDJSource(ctx context.Context, source AutoDJSource) (AutoDJSource, error) {
	switch source.Type {
	case AutoDJSourceLibrary:
		return defaultAutoDJSource(), nil
	case AutoDJSourcePlaylist:
		if source.PlaylistID <= 0 {
			return AutoDJSource{}, errors.New("playlist_id is required for playlist shuffle")
		}
		playlist, err := s.Library.GetPlaylistMetadata(ctx, source.PlaylistID)
		if err != nil {
			return AutoDJSource{}, err
		}
		return AutoDJSource{Type: AutoDJSourcePlaylist, PlaylistID: playlist.ID, Name: playlist.Name}, nil
	default:
		return AutoDJSource{}, errors.New("shuffle source type must be library or playlist")
	}
}
