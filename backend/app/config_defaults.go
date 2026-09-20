package main

import (
	"path/filepath"
	"strings"

	configpaths "listen-party/backend/config"
	appauth "listen-party/backend/internal/auth"
	domainrooms "listen-party/backend/rooms"
)

func NewDefaultConfig() (Config, error) {
	configDir, err := DefaultConfigDir()
	if err != nil {
		return Config{}, err
	}
	return NewDefaultConfigForRoot(configDir), nil
}

func NewDefaultConfigForRoot(configDir string) Config {
	return Config{
		Version:      currentConfigVersion,
		Revision:     1,
		Addr:         "0.0.0.0:8080",
		MusicDirs:    []string{filepath.Join(configDir, "music")},
		DatabasePath: configpaths.DatabasePath(configDir),
		ScanWorkers:  defaultScanWorkers,
		BannedIPs:    []string{},
		Rooms:        []domainrooms.Room{{ID: defaultRoomID, Name: "Public Room", Grants: domainrooms.OpenRoomGrants()}},
		Auth:         AuthConfig{PocketBase: appauth.DefaultConfig(configDir)},
	}
}

func (c *Config) ApplyDefaults() error {
	configDir, err := DefaultConfigDir()
	if err != nil {
		return err
	}
	return c.ApplyDefaultsForRoot(configDir)
}

func (c *Config) ApplyDefaultsForRoot(configRoot string) error {
	if configRoot == "" {
		var err error
		configRoot, err = DefaultConfigDir()
		if err != nil {
			return err
		}
	}
	if c.Addr == "" {
		c.Addr = "0.0.0.0:8080"
	}
	if c.Version <= 0 {
		c.Version = currentConfigVersion
	}
	if c.Revision <= 0 {
		c.Revision = 1
	}
	c.DatabasePath = configpaths.DatabasePath(configRoot)
	if c.ScanWorkers == 0 {
		c.ScanWorkers = defaultScanWorkers
	}
	c.BannedIPs = normalizeConfigList(c.BannedIPs)
	if c.BannedIPs == nil {
		c.BannedIPs = []string{}
	}
	if len(c.Rooms) == 0 {
		c.Rooms = []domainrooms.Room{{ID: defaultRoomID, Name: "Public Room", Grants: domainrooms.OpenRoomGrants()}}
	}
	for i := range c.Rooms {
		c.Rooms[i].ID = strings.TrimSpace(c.Rooms[i].ID)
		c.Rooms[i].Name = strings.TrimSpace(c.Rooms[i].Name)
		if c.Rooms[i].ID == "" && i == 0 {
			c.Rooms[i].ID = defaultRoomID
		}
		if c.Rooms[i].Name == "" {
			c.Rooms[i].Name = c.Rooms[i].ID
		}
		c.Rooms[i].Grants = normalizeRoomGrants(c.Rooms[i].Grants)
		c.Rooms[i].AdminGroups = normalizeConfigList(c.Rooms[i].AdminGroups)
	}
	c.Auth.PocketBase.DataDir = appauth.DataDir(configRoot)
	c.Auth.PocketBase.BootstrapAdminEmail = appauth.DefaultBootstrapAdminEmail()
	return nil
}
