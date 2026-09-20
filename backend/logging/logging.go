package logging

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
)

const ApplicationLogName = "listen-party.log"

func SetupApplicationLogging(stdout io.Writer) (*os.File, string, error) {
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		return nil, "", err
	}
	return SetupApplicationLoggingIn(stdout, userConfigDir)
}

func SetupApplicationLoggingIn(stdout io.Writer, userConfigDir string) (*os.File, string, error) {
	logDir := filepath.Join(userConfigDir, "listen-party", "logs")
	if err := os.MkdirAll(logDir, 0o700); err != nil {
		return nil, "", err
	}
	logPath := filepath.Join(logDir, ApplicationLogName)
	logFile, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o600)
	if err != nil {
		return nil, "", err
	}

	output := io.MultiWriter(stdout, logFile)
	slog.SetDefault(slog.New(slog.NewTextHandler(output, nil)))
	return logFile, logPath, nil
}
