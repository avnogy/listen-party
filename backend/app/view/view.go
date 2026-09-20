package view

import (
	"context"
	"errors"
	"net/http"

	"listen-party/backend/auth"
	musiclib "listen-party/backend/internal/library"
	"listen-party/backend/playback"
	"listen-party/backend/rooms"
)

type Host interface {
	AuthStore() auth.Gate
	RoomStore() *rooms.RoomManager
	CachedViewTracks(context.Context, playback.PlaybackState, []string) (map[string]musiclib.Track, error)
}

type ViewState struct {
	playback.PlaybackState
	Current     *ViewItem              `json:"current"`
	Queue       []ViewItem             `json:"queue"`
	History     []ViewItem             `json:"history"`
	Permissions []rooms.RoomPermission `json:"permissions"`
}

type ViewItem struct {
	playback.PlaybackItem
	Track *musiclib.Track `json:"track"`
}

func Build(ctx context.Context, state playback.PlaybackState, host Host) (ViewState, error) {
	keys := make([]string, 0, len(state.Queue)+len(state.History)+1)
	if state.Current.DedupeKey != "" {
		keys = append(keys, state.Current.DedupeKey)
	}
	for _, item := range state.Queue {
		keys = append(keys, item.DedupeKey)
	}
	for _, item := range state.History {
		keys = append(keys, item.DedupeKey)
	}
	tracks, err := host.CachedViewTracks(ctx, state, keys)
	if err != nil {
		return ViewState{}, err
	}
	view := ViewState{PlaybackState: state}
	view.Queue = make([]ViewItem, 0, len(state.Queue))
	view.History = make([]ViewItem, 0, len(state.History))
	if state.Current.DedupeKey != "" {
		view.Current = &ViewItem{PlaybackItem: state.Current}
		if track, ok := tracks[state.Current.DedupeKey]; ok {
			view.Current.Track = &track
		}
	}
	for _, item := range state.Queue {
		viewItem := ViewItem{PlaybackItem: item}
		if track, ok := tracks[item.DedupeKey]; ok {
			viewItem.Track = &track
		}
		view.Queue = append(view.Queue, viewItem)
	}
	for _, item := range state.History {
		viewItem := ViewItem{PlaybackItem: item}
		if track, ok := tracks[item.DedupeKey]; ok {
			viewItem.Track = &track
		}
		view.History = append(view.History, viewItem)
	}
	return view, nil
}

func ForRequest(r *http.Request, state playback.PlaybackState, host Host) (ViewState, error) {
	user, ok := host.AuthStore().CurrentUser(r)
	if !ok {
		return ViewState{}, errors.New("authentication required")
	}
	permissions, ok := host.RoomStore().PermissionsForUser(state.RoomID, user)
	if !ok {
		return ViewState{}, errors.New("room not found")
	}
	view, err := Build(r.Context(), state, host)
	if err != nil {
		return ViewState{}, err
	}
	view.Permissions = permissions
	return view, nil
}
