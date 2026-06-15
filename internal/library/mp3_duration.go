package library

import (
	"io"
	"os"

	"github.com/tcolgate/mp3"
)

func mp3DurationMS(path string) (total int64) {
	f, err := os.Open(path)
	if err != nil {
		return 0
	}
	defer f.Close()

	var frame mp3.Frame
	var skipped int
	decoder := mp3.NewDecoder(f)
	for {
		switch err := decoder.Decode(&frame, &skipped); err {
		case nil:
			total += frame.Duration().Milliseconds()
		case io.EOF:
			return total
		default:
			return 0
		}
	}
}
