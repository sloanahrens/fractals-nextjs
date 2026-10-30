// The bats runner's own tests. The suite in tests/ is run by release_test.go's
// TestBatsSuite; what is tested here is how that test treats the child it
// starts, which is the behaviour bead dv-psid is about: a suite that is stopped
// at its budget has to read as a budget, and not as a broken script, or the
// next person to see a red gate on a package they did not touch has to go
// looking for a script that was never wrong.
//
// The stand-ins are scripts rather than bats: the runner is handed a binary and
// a directory, and a three-line script is enough to be any of the three children
// that matter. Nothing here needs bats to be installed, so these checks run on
// every machine, including the ones TestBatsSuite skips on.
package release

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRunBatsSuite(t *testing.T) {
	const long = time.Minute

	for _, tc := range []struct {
		name   string
		suite  string
		budget time.Duration
		want   []string
	}{
		{
			name:   "a suite that passes reports nothing",
			suite:  "printf '1..2\\nok 1 the first check\\nok 2 the second\\n'\n",
			budget: long,
		},
		{
			name:   "a child still running when the budget runs out is reported as a budget",
			suite:  "while :; do :; done\n",
			budget: 300 * time.Millisecond,
			want:   []string{"300ms budget ran out", "bead dv-psid"},
		},
		{
			// The stand-in fails unless bats was started with the per-test
			// bound in its environment, so a pass proves the variable got there.
			name:   "bats is started with a per-test timeout of a minute",
			suite:  "[ \"$BATS_TEST_TIMEOUT\" = 60 ] || { printf '1..1\\nnot ok 1 BATS_TEST_TIMEOUT=[%s]\\n' \"$BATS_TEST_TIMEOUT\"; exit 1; }\nprintf '1..1\\nok 1 bound is set\\n'\n",
			budget: long,
		},
		{
			name:   "a test that bats stopped for its timeout names BATS_TEST_TIMEOUT",
			suite:  "printf '1..2\\nok 1 the first\\nnot ok 2 slow # timeout after 60s\\n'; exit 1\n",
			budget: long,
			want:   []string{"not ok 2 slow # timeout after 60s", "BATS_TEST_TIMEOUT=60s", "do not raise the timeout"},
		},
		{
			name:   "a suite that failed reports the bats output",
			suite:  "printf '1..2\\nok 1 the first check\\nnot ok 2 the second\\n'; exit 1\n",
			budget: long,
			want:   []string{"exit status 1", "not ok 2 the second"},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			err := runBatsSuite(t.Context(), standInBats(t, tc.suite), ".", tc.budget)

			if len(tc.want) == 0 {
				if err != nil {
					t.Fatalf("runBatsSuite = %v, want no error", err)
				}
				return
			}
			if err == nil {
				t.Fatal("runBatsSuite = nil, want the failure it names")
			}
			for _, want := range tc.want {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("runBatsSuite = %q, want it to name %q", err, want)
				}
			}
			// A budget kill must not read as a check that failed: the two send a
			// reader to different places.
			if strings.Contains(tc.want[0], "budget") && strings.Contains(err.Error(), "reported a failing test") {
				t.Errorf("runBatsSuite = %q, want a budget kill not to be reported as a failing suite", err)
			}
		})
	}
}

// standInBats writes a bats stand-in that does what body says, and returns its
// path. It is written into a temporary directory, so no test of the runner
// reaches the directory of a real suite.
func standInBats(t *testing.T, body string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "bats")
	if err := os.WriteFile(path, []byte("#!/bin/sh\n"+body), 0o755); err != nil {
		t.Fatalf("write the stand-in bats: %v", err)
	}
	return path
}
