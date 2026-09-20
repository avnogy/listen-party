package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	appauth "listen-party/internal/auth"
)

type AuthConfig struct {
	PocketBase appauth.Config `json:"pocketbase"`
}

type Config struct {
	Version      int        `json:"version"`
	Revision     int64      `json:"revision"`
	Addr         string     `json:"addr"`
	MusicDirs    []string   `json:"music_dirs"`
	DatabasePath string     `json:"-"`
	ScanWorkers  int        `json:"scan_workers"`
	BannedIPs    []string   `json:"banned_ips"`
	Rooms        []Room     `json:"rooms"`
	Auth         AuthConfig `json:"auth"`
}

const (
	defaultScanWorkers   = 16
	maxScanWorkers       = 256
	defaultRoomID        = "main"
	currentConfigVersion = 1
)

var roomIDPattern = regexp.MustCompile(`^[a-z0-9][a-z0-9_-]{0,63}$`)

func DefaultConfigDir() (string, error) {
	base, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(base, "listen-party"), nil
}

func DefaultConfigPath() (string, error) {
	dir, err := DefaultConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "config.json"), nil
}

func ResolveConfigPath(path string) (string, error) {
	if path != "" {
		return path, nil
	}
	return DefaultConfigPath()
}

func DefaultDatabasePath() (string, error) {
	dir, err := DefaultConfigDir()
	if err != nil {
		return "", err
	}
	return databasePath(dir), nil
}

func DefaultMusicDir() (string, error) {
	dir, err := DefaultConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "music"), nil
}

func LoadConfig(path string) (Config, error) {
	var err error
	path, err = ResolveConfigPath(path)
	if err != nil {
		return Config{}, err
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return createDefaultConfig(path)
		}
		return Config{}, err
	}

	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return Config{}, fmt.Errorf("parse %s: %w", path, err)
	}
	migrated := migrateConfig(&cfg)
	if err := cfg.ApplyDefaultsForRoot(filepath.Dir(path)); err != nil {
		return Config{}, err
	}
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	if err := cfg.EnsureMusicDirs(); err != nil {
		return Config{}, err
	}
	if migrated {
		if err := SaveConfig(path, cfg); err != nil {
			return Config{}, fmt.Errorf("save migrated config: %w", err)
		}
	}
	return cfg, nil
}

func migrateConfig(cfg *Config) bool {
	if cfg == nil || cfg.Version >= currentConfigVersion {
		return false
	}
	if len(cfg.Rooms) > 0 {
		if cfg.Rooms[0].Grants == nil {
			cfg.Rooms[0].Grants = make(map[string][]RoomPermission)
		}
		cfg.Rooms[0].Grants[EveryoneRoomGrant] = append([]RoomPermission(nil), roomPermissions...)
	}
	cfg.Version = currentConfigVersion
	return true
}

func SaveConfig(path string, cfg Config) error {
	path, err := ResolveConfigPath(path)
	if err != nil {
		return err
	}
	if err := cfg.ApplyDefaultsForRoot(filepath.Dir(path)); err != nil {
		return err
	}
	if err := cfg.Validate(); err != nil {
		return err
	}
	if err := cfg.EnsureMusicDirs(); err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return err
	}
	data = append(data, '\n')
	return os.WriteFile(path, data, 0o600)
}

func createDefaultConfig(path string) (Config, error) {
	cfg := NewDefaultConfigForRoot(filepath.Dir(path))
	if err := cfg.Validate(); err != nil {
		return Config{}, err
	}
	if err := cfg.EnsureMusicDirs(); err != nil {
		return Config{}, err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return Config{}, err
	}
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return Config{}, err
	}
	data = append(data, '\n')
	if err := os.WriteFile(path, data, 0o600); err != nil {
		return Config{}, err
	}
	return cfg, nil
}

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
		Auth: AuthConfig{
			PocketBase: appauth.DefaultConfig(configDir),
		},
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
