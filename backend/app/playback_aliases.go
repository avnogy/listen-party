package main

import domainplayback "listen-party/backend/playback"

var (
	ErrEmptyQueue        = domainplayback.ErrEmptyQueue
	ErrQueueFull         = domainplayback.ErrQueueFull
	ErrQueueItemNotFound = domainplayback.ErrQueueItemNotFound
)

type PlaybackItem = domainplayback.PlaybackItem
type AutoDJSource = domainplayback.AutoDJSource
type AutoDJState = domainplayback.AutoDJState
type RoomAudio = domainplayback.RoomAudio
type RoomAction = domainplayback.RoomAction
type PlaybackState = domainplayback.PlaybackState
type Playback = domainplayback.Playback
type PersistedPlayback = domainplayback.PersistedPlayback

const (
	AutoDJSourceLibrary  = domainplayback.AutoDJSourceLibrary
	AutoDJSourcePlaylist = domainplayback.AutoDJSourcePlaylist
)

func defaultAutoDJSource() AutoDJSource {
	return domainplayback.DefaultAutoDJSource()
}

func NewPlayback(roomID string) *Playback {
	return domainplayback.NewPlayback(roomID)
}
