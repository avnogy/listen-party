//go:build !linux

package network

import "syscall"

func SetReusePort(network, address string, conn syscall.RawConn) error {
	return nil
}
