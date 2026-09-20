package main

import (
	"io"
	"os"

	appLogging "listen-party/backend/logging"
)

const applicationLogName = appLogging.ApplicationLogName

func setupApplicationLogging(stdout io.Writer) (*os.File, string, error) {
	return appLogging.SetupApplicationLogging(stdout)
}

func setupApplicationLoggingIn(stdout io.Writer, userConfigDir string) (*os.File, string, error) {
	return appLogging.SetupApplicationLoggingIn(stdout, userConfigDir)
}
