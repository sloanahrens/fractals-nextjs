package release

import "gt.local/devops/internal/testinputs"

// declareInputs reads, in the test process, the files the tests run in a subprocess.
// go test's result cache keys on the files the test process opens after m.Run starts,
// so a read in TestMain is not recorded: call this from inside the test, or the helper
// it calls, before the subprocess starts (docs/testing.md, internal/testinputs).
func declareInputs() {
	testinputs.Must("scripts/release")
}
