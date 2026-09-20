package config

import (
	"errors"
	"fmt"
	"net/netip"
	"slices"

	domainrooms "listen-party/backend/rooms"
)

func (c Config) Validate() error {
	if len(c.MusicDirs) == 0 {
		return errors.New("music_dirs must contain at least one directory")
	}
	if c.ScanWorkers <= 0 {
		return errors.New("scan_workers must be greater than zero")
	}
	if c.ScanWorkers > maxScanWorkers {
		return fmt.Errorf("scan_workers must be %d or less", maxScanWorkers)
	}
	for _, dir := range c.MusicDirs {
		if dir == "" {
			return errors.New("music_dirs must not contain empty paths")
		}
	}
	for _, ip := range c.BannedIPs {
		if _, err := netip.ParseAddr(ip); err != nil {
			return fmt.Errorf("banned_ips contains invalid IP %q", ip)
		}
	}
	if len(c.Rooms) > 0 {
		if err := validateRooms(c.Rooms); err != nil {
			return err
		}
	}
	return nil
}

func validateRooms(rooms []domainrooms.Room) error {
	if len(rooms) == 0 {
		return errors.New("rooms must contain at least one room")
	}
	seen := make(map[string]struct{}, len(rooms))
	reserved := []string{"admin", "api", "assets", "authAdmin", "events", "healthz", "login", "logout", "media", "rooms"}
	for _, room := range rooms {
		if !roomIDPattern.MatchString(room.ID) {
			return fmt.Errorf("room id %q must be lowercase URL-safe text", room.ID)
		}
		if slices.Contains(reserved, room.ID) {
			return fmt.Errorf("room id %q is reserved", room.ID)
		}
		if _, ok := seen[room.ID]; ok {
			return fmt.Errorf("duplicate room id %q", room.ID)
		}
		seen[room.ID] = struct{}{}
		if room.Name == "" {
			return fmt.Errorf("room %q name is required", room.ID)
		}
		for _, group := range room.AdminGroups {
			if group == "" || group == domainrooms.EveryoneRoomGrant {
				return fmt.Errorf("room %q has invalid administrator group %q", room.ID, group)
			}
		}
		for group, permissions := range room.Grants {
			if group == "" {
				return fmt.Errorf("room %q grants must not contain an empty group", room.ID)
			}
			if len(permissions) == 0 {
				return fmt.Errorf("room %q group %q must have at least one permission", room.ID, group)
			}
			for _, permission := range permissions {
				if !slices.Contains(domainrooms.SupportedPermissions, permission) {
					return fmt.Errorf("room %q group %q has unknown permission %q", room.ID, group, permission)
				}
			}
		}
		for userID, permissions := range room.UserOverrides {
			if userID == "" {
				return fmt.Errorf("room %q user overrides must not contain an empty user id", room.ID)
			}
			for _, permission := range permissions {
				if !slices.Contains(domainrooms.SupportedPermissions, permission) {
					return fmt.Errorf("room %q user %q has unknown permission %q", room.ID, userID, permission)
				}
			}
		}
	}
	return nil
}
