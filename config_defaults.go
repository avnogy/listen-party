package main

import (
	"path/filepath"
	"strings"

	appauth "listen-party/internal/auth"
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
		DatabasePath: databasePath(configDir),
		ScanWorkers:  defaultScanWorkers,
		BannedIPs:    []string{},
		Rooms:        []Room{{ID: defaultRoomID, Name: "Public Room", Grants: openRoomGrants()}},
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
	c.DatabasePath = databasePath(configRoot)
	if c.ScanWorkers == 0 {
		c.ScanWorkers = defaultScanWorkers
	}
	c.BannedIPs = normalizeConfigList(c.BannedIPs)
	if c.BannedIPs == nil {
		c.BannedIPs = []string{}
	}
	if len(c.Rooms) == 0 {
		c.Rooms = []Room{{ID: defaultRoomID, Name: "Public Room", Grants: openRoomGrants()}}
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

func databasePath(configRoot string) string {
	return filepath.Join(configRoot, "listen-party.sqlite")
}
