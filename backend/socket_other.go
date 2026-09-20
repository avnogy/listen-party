//go:build !linux

package main

import "syscall"

func setReusePort(network, address string, conn syscall.RawConn) error {
	return nil
}
