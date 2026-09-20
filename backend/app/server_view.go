package main

import (
	"context"
	"errors"
	"net/http"

	musiclib "listen-party/backend/internal/library"
	"listen-party/backend/playback"
	"listen-party/backend/rooms"
)

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

func (s *Server) viewState(ctx context.Context, state playback.PlaybackState) (ViewState, error) {
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
	tracks, err := s.cachedViewTracks(ctx, state, keys)
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

func (s *Server) cachedViewTracks(ctx context.Context, state playback.PlaybackState, keys []string) (map[string]musiclib.Track, error) {
	s.viewCacheMu.Lock()
	defer s.viewCacheMu.Unlock()
	if cached, ok := s.viewCache[state.RoomID]; ok {
		if cached.revision == state.Revision {
			return cached.tracks, nil
		}
		if cached.revision > state.Revision {
			return s.Library.ListByDedupeKeys(ctx, keys)
		}
	}
	tracks, err := s.Library.ListByDedupeKeys(ctx, keys)
	if err != nil {
		return nil, err
	}
	if s.viewCache == nil {
		s.viewCache = make(map[string]viewTrackCache)
	}
	s.viewCache[state.RoomID] = viewTrackCache{revision: state.Revision, tracks: tracks}
	return tracks, nil
}

func (s *Server) invalidateViewCache() {
	s.viewCacheMu.Lock()
	clear(s.viewCache)
	s.viewCacheMu.Unlock()
}

func (s *Server) viewStateForRequest(r *http.Request, state playback.PlaybackState) (ViewState, error) {
	user, ok := s.Auth.CurrentUser(r)
	if !ok {
		return ViewState{}, errors.New("authentication required")
	}
	permissions, ok := s.Rooms.PermissionsForUser(state.RoomID, user)
	if !ok {
		return ViewState{}, errors.New("room not found")
	}
	view, err := s.viewState(r.Context(), state)
	if err != nil {
		return ViewState{}, err
	}
	view.Permissions = permissions
	return view, nil
}
