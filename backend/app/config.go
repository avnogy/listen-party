package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"

	configpaths "listen-party/backend/config"
	appauth "listen-party/backend/internal/auth"
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
	return configpaths.DefaultDir()
}

func DefaultConfigPath() (string, error) {
	return configpaths.DefaultPath()
}

func ResolveConfigPath(path string) (string, error) {
	return configpaths.ResolvePath(path)
}

func DefaultDatabasePath() (string, error) {
	dir, err := DefaultConfigDir()
	if err != nil {
		return "", err
	}
	return configpaths.DatabasePath(dir), nil
}

func DefaultMusicDir() (string, error) {
	return configpaths.MusicDir()
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
