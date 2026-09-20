//go:build linux

package main

import (
	"syscall"
)

const soReusePort = 0x0f

func setReusePort(network, address string, conn syscall.RawConn) error {
	var sockErr error
	err := conn.Control(func(fd uintptr) {
		if err := syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, syscall.SO_REUSEADDR, 1); err != nil {
			sockErr = err
			return
		}
		sockErr = syscall.SetsockoptInt(int(fd), syscall.SOL_SOCKET, soReusePort, 1)
	})
	if err != nil {
		return err
	}
	return sockErr
}
