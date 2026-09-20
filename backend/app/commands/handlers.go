package commands

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/rand"
	"net"
	"net/http"
	"net/netip"
	"strings"

	"listen-party/backend/auth"
	appauth "listen-party/backend/auth"
	httpapi "listen-party/backend/http"
	musiclib "listen-party/backend/internal/library"
	"listen-party/backend/playback"
	"listen-party/backend/rooms"
)

type Host interface {
	AuthStore() auth.Gate
	RoomFromRequest(http.ResponseWriter, *http.Request) (*rooms.Room, appauth.UserInfo, bool)
	LibraryStore() *musiclib.Library
	RoomStore() *rooms.RoomManager
	SavePlayback(context.Context, *rooms.Room) error
	StabilizeAndSchedulePlayback(context.Context, *rooms.Room, playback.PlaybackState) playback.PlaybackState
	ViewStateForRequest(*http.Request, playback.PlaybackState) (any, error)
	WriteCommandState(http.ResponseWriter, *http.Request, string, *rooms.Room, string, playback.PlaybackState)
}

const maxRoomVolume = 0.5

func clientIP(remoteAddr string) (netip.Addr, bool) {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = strings.Trim(remoteAddr, "[]")
	}
	ip, err := netip.ParseAddr(host)
	return ip, err == nil
}

var errAutoDJConfigurationChanged = errors.New("auto-dj configuration changed")

func Handle(w http.ResponseWriter, r *http.Request, host Host) {
	room, user, ok := host.RoomFromRequest(w, r)
	if !ok {
		return
	}
	var req commandRequest
	if !httpapi.ReadJSON(w, r, &req) {
		return
	}
	permission, known := PermissionForAction(req.Action)
	if !known {
		http.Error(w, "unknown action", http.StatusBadRequest)
		return
	}
	if !host.RoomStore().UserHasPermission(room.ID, user, permission) {
		http.Error(w, "room permission denied", http.StatusForbidden)
		return
	}
	displayName := user.Display()
	dispatchCommandAction(w, r, room, displayName, req, host)
}

type commandRequest struct {
	Action            string                `json:"action"`
	DedupeKey         string                `json:"dedupe_key"`
	QueueItemID       int64                 `json:"queue_item_id"`
	BeforeQueueItemID int64                 `json:"before_queue_item_id"`
	PositionMS        int64                 `json:"position_ms"`
	Enabled           bool                  `json:"enabled"`
	Source            playback.AutoDJSource `json:"source"`
	Volume            float64               `json:"volume"`
	Muted             bool                  `json:"muted"`
}

func dispatchCommandAction(w http.ResponseWriter, r *http.Request, room *rooms.Room, displayName string, req commandRequest, host Host) {
	switch req.Action {
	case "auto_dj":
		if !req.Enabled {
			host.WriteCommandState(w, r, "auto_dj_disable", room, displayName, room.Playback.ConfigureAutoDJ(false, "", nil))
			return
		}
		config, _ := room.Playback.AutoDJConfiguration()
		candidate, entries, err := newAutoDJCycle(r.Context(), config.Source, host)
		if err != nil {
			httpapi.WriteError(w, err)
			return
		}
		state, configured := room.Playback.ConfigureAutoDJForSource(config.Source, true, candidate, entries)
		if !configured {
			http.Error(w, "shuffle source changed; retry", http.StatusConflict)
			return
		}
		host.WriteCommandState(w, r, "auto_dj_enable", room, displayName, state)
	case "auto_dj_source":
		source, err := resolveAutoDJSource(r.Context(), req.Source, host)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		config, _ := room.Playback.AutoDJConfiguration()
		if !config.Enabled {
			var available bool
			if source.Type == playback.AutoDJSourceLibrary {
				count, err := host.LibraryStore().Count(r.Context())
				if err != nil {
					httpapi.WriteError(w, err)
					return
				}
				available = count > 0
			} else {
				entries, err := host.LibraryStore().PlaylistShuffleItemIDs(r.Context(), source.PlaylistID)
				if err != nil {
					httpapi.WriteError(w, err)
					return
				}
				available = len(entries) > 0
			}
			if !available {
				http.Error(w, "shuffle source contains no available tracks", http.StatusConflict)
				return
			}
			host.WriteCommandState(w, r, "auto_dj_source", room, displayName, room.Playback.ConfigureAutoDJSource(source, "", nil))
			return
		}
		candidate, entries, err := newAutoDJCycle(r.Context(), source, host)
		if err != nil {
			httpapi.WriteError(w, err)
			return
		}
		host.WriteCommandState(w, r, "auto_dj_source", room, displayName, room.Playback.ConfigureAutoDJSource(source, candidate, entries))
	case "queue_add":
		if req.DedupeKey == "" {
			http.Error(w, "dedupe_key is required", http.StatusBadRequest)
			return
		}
		track, err := host.LibraryStore().ResolveDedupeKey(r.Context(), req.DedupeKey)
		if err != nil {
			httpapi.WriteError(w, err)
			return
		}
		if track.DurationMS <= 0 {
			host.LibraryStore().EnsureDuration(track.ID)
		}
		state, err := room.Playback.Add(req.DedupeKey, displayName)
		if err != nil {
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		host.WriteCommandState(w, r, "queue_add", room, displayName, state)
	case "queue_remove":
		if req.QueueItemID <= 0 {
			http.Error(w, "queue_item_id is required", http.StatusBadRequest)
			return
		}
		before := room.Playback.Snapshot()
		removed, ok := queueItemByID(before.Queue, req.QueueItemID)
		state := room.Playback.Remove(req.QueueItemID)
		if ok && len(state.Queue) != len(before.Queue) {
			state = recordRoomAction(r, room, displayName, fmt.Sprintf("Removed %q from the queue.", trackActionName(r.Context(), removed.DedupeKey, host)), host)
		}
		host.WriteCommandState(w, r, "queue_remove", room, displayName, state)
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
			movedName := trackActionName(r.Context(), moved.DedupeKey, host)
			if req.BeforeQueueItemID == 0 {
				state = recordRoomAction(r, room, displayName, fmt.Sprintf("Moved %q to the end of the queue.", movedName), host)
			} else if targetOK {
				state = recordRoomAction(r, room, displayName, fmt.Sprintf("Moved %q before %q in the queue.", movedName, trackActionName(r.Context(), target.DedupeKey, host)), host)
			}
		}
		host.WriteCommandState(w, r, "queue_reorder", room, displayName, state)
	case "queue_clear":
		before := room.Playback.Snapshot()
		state := room.Playback.Clear()
		if len(before.Queue) > 0 {
			state = recordRoomAction(r, room, displayName, "Cleared the queue.", host)
		}
		host.WriteCommandState(w, r, "queue_clear", room, displayName, state)
	case "play":
		state, err := room.Playback.Play()
		if err != nil {
			slog.Warn("play rejected", "remote", r.RemoteAddr, "room", room.ID, "error", err)
			http.Error(w, err.Error(), http.StatusConflict)
			return
		}
		host.WriteCommandState(w, r, "play", room, displayName, state)
	case "play_now":
		if req.DedupeKey == "" {
			http.Error(w, "dedupe_key is required", http.StatusBadRequest)
			return
		}
		track, err := host.LibraryStore().ResolveDedupeKey(r.Context(), req.DedupeKey)
		if err != nil {
			httpapi.WriteError(w, err)
			return
		}
		if track.DurationMS <= 0 {
			host.LibraryStore().EnsureDuration(track.ID)
		}
		before := room.Playback.Snapshot()
		state := room.Playback.PlayNow(req.DedupeKey, displayName)
		if before.Current.DedupeKey != "" {
			state = recordRoomAction(r, room, displayName, fmt.Sprintf("Played %q now, replacing %q.", trackActionTitle(track), trackActionName(r.Context(), before.Current.DedupeKey, host)), host)
		}
		host.WriteCommandState(w, r, "play_now", room, displayName, state)
	case "pause":
		host.WriteCommandState(w, r, "pause", room, displayName, room.Playback.Pause())
	case "room_audio":
		if req.Volume < 0 || req.Volume > maxRoomVolume {
			http.Error(w, "volume must be between 0 and 0.5", http.StatusBadRequest)
			return
		}
		host.WriteCommandState(w, r, "room_audio", room, displayName, room.Playback.SetRoomAudio(req.Volume, req.Muted))
	case "previous":
		host.WriteCommandState(w, r, "previous", room, displayName, room.Playback.Previous())
	case "seek":
		host.WriteCommandState(w, r, "seek", room, displayName, room.Playback.SeekTo(req.PositionMS))
	case "skip":
		before := room.Playback.Snapshot()
		if err := PrepareAutoDJ(r.Context(), room, host); err != nil {
			httpapi.WriteError(w, err)
			return
		}
		state := room.Playback.Skip()
		ReplenishAutoDJ(r.Context(), room, host)
		if before.Current.DedupeKey != "" {
			state = recordRoomAction(r, room, displayName, skipActionText(r.Context(), before.Current.DedupeKey, state.Current.DedupeKey, host), host)
		}
		host.WriteCommandState(w, r, "skip", room, displayName, state)
	case "history_clear":
		host.WriteCommandState(w, r, "history_clear", room, displayName, room.Playback.ClearHistory())
	}

}

func queueItemByID(queue []playback.PlaybackItem, id int64) (playback.PlaybackItem, bool) {
	if id <= 0 {
		return playback.PlaybackItem{}, false
	}
	for _, item := range queue {
		if item.ID == id {
			return item, true
		}
	}
	return playback.PlaybackItem{}, false
}

func queueOrderChanged(before, after []playback.PlaybackItem) bool {
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

func recordRoomAction(r *http.Request, room *rooms.Room, username, text string, host Host) playback.PlaybackState {
	ip := ""
	if parsedIP, ok := clientIP(r.RemoteAddr); ok {
		ip = parsedIP.String()
	}
	return room.Playback.AddAction(playback.RoomAction{
		IP:       ip,
		Username: username,
		Text:     text,
	})
}

func skipActionText(ctx context.Context, previousKey, _ string, host Host) string {
	previousName := trackActionName(ctx, previousKey, host)
	return fmt.Sprintf("Skipped %q.", previousName)
}

func trackActionName(ctx context.Context, dedupeKey string, host Host) string {
	if dedupeKey == "" || host.LibraryStore() == nil {
		return "Unavailable track"
	}
	track, err := host.LibraryStore().ResolveDedupeKey(ctx, dedupeKey)
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

func PermissionForAction(action string) (rooms.RoomPermission, bool) {
	switch action {
	case "queue_add":
		return rooms.PermissionQueueAdd, true
	case "queue_remove", "queue_reorder", "queue_clear", "history_clear", "auto_dj", "auto_dj_source":
		return rooms.PermissionQueueManage, true
	case "play", "play_now", "pause", "previous", "seek", "skip":
		return rooms.PermissionPlaybackControl, true
	case "room_audio":
		return rooms.PermissionVolumeControl, true
	default:
		return "", false
	}
}

func PrepareAutoDJ(ctx context.Context, room *rooms.Room, host Host) error {
	config, candidate := room.Playback.AutoDJConfiguration()
	if !config.Enabled {
		return nil
	}
	if candidate != "" {
		if _, err := host.LibraryStore().ResolveDedupeKey(ctx, candidate); err == nil {
			return nil
		} else if !errors.Is(err, musiclib.ErrTrackNotFound) {
			return err
		}
		if !room.Playback.ClearAutoDJCandidate(config.Source) {
			return nil
		}
	}
	_, err := prepareAutoDJCandidate(ctx, room, config.Source, host)
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

func ReplenishAutoDJ(ctx context.Context, room *rooms.Room, host Host) {
	config, candidate := room.Playback.AutoDJConfiguration()
	if !config.Enabled || candidate != "" {
		return
	}
	_, err := prepareAutoDJCandidate(ctx, room, config.Source, host)
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

func newAutoDJCycle(ctx context.Context, source playback.AutoDJSource, host Host) (string, []int64, error) {
	entries, err := autoDJEntries(ctx, source, host)
	if err != nil {
		return "", nil, err
	}
	if len(entries) == 0 {
		return "", nil, musiclib.ErrTrackNotFound
	}
	rand.Shuffle(len(entries), func(i, j int) { entries[i], entries[j] = entries[j], entries[i] })
	return resolveAutoDJEntries(ctx, source, entries, host)
}

func autoDJEntries(ctx context.Context, source playback.AutoDJSource, host Host) ([]int64, error) {
	if source.Type == playback.AutoDJSourcePlaylist {
		return host.LibraryStore().PlaylistShuffleItemIDs(ctx, source.PlaylistID)
	}
	return host.LibraryStore().ShuffleTrackIDs(ctx)
}

func nextAutoDJCandidate(ctx context.Context, room *rooms.Room, source playback.AutoDJSource, host Host) (string, error) {
	for {
		entry, ok := room.Playback.TakeAutoDJEntry(source)
		if ok {
			track, err := resolveAutoDJEntry(ctx, source, entry, host)
			if errors.Is(err, musiclib.ErrTrackNotFound) {
				continue
			}
			if err != nil {
				return "", err
			}
			return track.DedupeKey, nil
		}
		entries, err := autoDJEntries(ctx, source, host)
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

func prepareAutoDJCandidate(ctx context.Context, room *rooms.Room, source playback.AutoDJSource, host Host) (string, error) {
	if !room.Playback.BeginAutoDJCandidate(source) {
		return "", errAutoDJConfigurationChanged
	}
	candidate, err := nextAutoDJCandidate(ctx, room, source, host)
	if err != nil {
		room.Playback.CompleteAutoDJCandidate(source, "")
		return "", err
	}
	if !room.Playback.CompleteAutoDJCandidate(source, candidate) {
		return "", errAutoDJConfigurationChanged
	}
	return candidate, nil
}

func resolveAutoDJEntries(ctx context.Context, source playback.AutoDJSource, entries []int64, host Host) (string, []int64, error) {
	for len(entries) > 0 {
		last := len(entries) - 1
		entry := entries[last]
		entries = entries[:last]
		track, err := resolveAutoDJEntry(ctx, source, entry, host)
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

func resolveAutoDJEntry(ctx context.Context, source playback.AutoDJSource, entry int64, host Host) (musiclib.Track, error) {
	if source.Type == playback.AutoDJSourcePlaylist {
		return host.LibraryStore().PlaylistItemTrack(ctx, source.PlaylistID, entry)
	}
	return host.LibraryStore().GetCached(ctx, entry)
}

func resolveAutoDJSource(ctx context.Context, source playback.AutoDJSource, host Host) (playback.AutoDJSource, error) {
	switch source.Type {
	case playback.AutoDJSourceLibrary:
		return playback.DefaultAutoDJSource(), nil
	case playback.AutoDJSourcePlaylist:
		if source.PlaylistID <= 0 {
			return playback.AutoDJSource{}, errors.New("playlist_id is required for playlist shuffle")
		}
		playlist, err := host.LibraryStore().GetPlaylistMetadata(ctx, source.PlaylistID)
		if err != nil {
			return playback.AutoDJSource{}, err
		}
		return playback.AutoDJSource{Type: playback.AutoDJSourcePlaylist, PlaylistID: playlist.ID, Name: playlist.Name}, nil
	default:
		return playback.AutoDJSource{}, errors.New("shuffle source type must be library or playlist")
	}
}
