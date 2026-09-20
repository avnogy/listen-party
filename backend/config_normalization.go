package main

import (
	"fmt"
	"os"
	"slices"
	"strings"
)

func normalizeRoomGrants(grants map[string][]RoomPermission) map[string][]RoomPermission {
	if len(grants) == 0 {
		return nil
	}
	normalized := make(map[string][]RoomPermission, len(grants))
	for group, permissions := range grants {
		group = strings.TrimSpace(group)
		for _, permission := range permissions {
			permission = RoomPermission(strings.TrimSpace(string(permission)))
			if permission != "" && !slices.Contains(normalized[group], permission) {
				normalized[group] = append(normalized[group], permission)
			}
		}
		if _, ok := normalized[group]; !ok {
			normalized[group] = nil
		}
	}
	return normalized
}

func normalizeConfigList(values []string) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value != "" && !slices.Contains(out, value) {
			out = append(out, value)
		}
	}
	return out
}

func (c Config) EnsureMusicDirs() error {
	for _, dir := range c.MusicDirs {
		if err := os.MkdirAll(dir, 0o755); err != nil {
			return fmt.Errorf("create music dir %s: %w", dir, err)
		}
	}
	return nil
}
