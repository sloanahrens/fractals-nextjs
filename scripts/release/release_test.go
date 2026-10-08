// Package release holds no code: it exists so the release scripts and their
// bats suite (docs/plan.md, bead B5.2) are checked by `go test ./...`, which is
// what the gate runs.
//
// The checks here mirror ops/ops_test.go, the rig's other shell-script package:
// every script must parse, every script must be executable, shellcheck must be
// clean when shellcheck is installed, and nothing may name a path that exists
// only on the machine the scripts were written on. The bats suite is the
// substance of the bead, so the Go test runs it too, when bats is available.
package release

import (
	"context"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// forbidden are the substrings no file under scripts/release may contain: the
// operator's home directory, and the per-session scratch tree an earlier
// wizard was authored in. Both are assembled at run time because this file
// lives under scripts/release and would otherwise trip the scan it performs
// (the same trick as ops/ops_test.go).
var forbidden = []string{"/Users/" + "sloan", "claude-" + "501"}

// commands are the scripts a release runs, in the order the flow uses them.
var commands = []string{
	"build_push.sh",
	"mint_token.sh",
	"preview.sh",
	"up.sh",
	"promote.sh",
	"health.sh",
}

// bashFiles returns every shell file in the package that bash itself can parse:
// the commands and lib.sh, the fakes, and the bats helpers. The paths are
// relative to the package directory the tests run in.
//
// The .bats files are not in this list: `@test "name" {` is not bash syntax, so
// bash -n rejects a bats file that is perfectly good. bats parses them when it
// runs the suite, and shellcheck understands the bats dialect (see
// shellFiles).
func bashFiles(t *testing.T) []string {
	t.Helper()

	var files []string
	collect := func(pattern string) {
		matches, err := filepath.Glob(pattern)
		if err != nil {
			t.Fatalf("glob %s: %v", pattern, err)
		}
		if len(matches) == 0 {
			t.Fatalf("no shell files match %s", pattern)
		}
		files = append(files, matches...)
	}

	collect("*.sh")
	collect("tests/helpers.bash")
	collect("tests/fakes/*")
	return files
}

// shellFiles returns everything a linter should read: the bash files plus the
// bats suite.
func shellFiles(t *testing.T) []string {
	t.Helper()

	files := bashFiles(t)
	matches, err := filepath.Glob("tests/*.bats")
	if err != nil {
		t.Fatalf("glob tests/*.bats: %v", err)
	}
	if len(matches) == 0 {
		t.Fatal("no bats files match tests/*.bats")
	}
	return append(files, matches...)
}

// TestReleaseScriptsArePresent checks the six scripts of the release flow are
// there and executable. Git records the mode, so a lost exec bit is a shipped
// regression rather than a local quirk.
func TestReleaseScriptsArePresent(t *testing.T) {
	for _, script := range commands {
		t.Run(script, func(t *testing.T) {
			fi, err := os.Stat(script)
			if err != nil {
				t.Fatalf("stat %s: %v", script, err)
			}
			if fi.Mode().Perm()&0o111 == 0 {
				t.Errorf("%s mode = %v, want it executable", script, fi.Mode().Perm())
			}
		})
	}
}

// TestShellFilesParse runs bash -n on every shell file. It catches the syntax
// error that would otherwise be found by a release.
func TestShellFilesParse(t *testing.T) {
	for _, file := range bashFiles(t) {
		t.Run(file, func(t *testing.T) {
			out, err := exec.Command("bash", "-n", file).CombinedOutput()
			if err != nil {
				t.Fatalf("bash -n %s = %v\n%s", file, err, out)
			}
		})
	}
}

// TestShellFilesShellcheck runs the lint the bead's gate promises. SC2034 is
// off because the scripts fill in variables (APP, PROJECT, DIGEST_FILE, ...)
// that only the sourced lib.sh reads; shellcheck cannot see across that
// boundary. -x follows lib.sh, so a mistake there is still reported here.
//
// shellcheck is not needed to run a release, so its absence skips this one
// check instead of failing the gate on a machine that does not have it, exactly
// as ops/ops_test.go does for the wizards.
func TestShellFilesShellcheck(t *testing.T) {
	shellcheck, err := exec.LookPath("shellcheck")
	if err != nil {
		t.Skip("shellcheck is not on PATH; install it to run this check")
	}
	for _, file := range shellFiles(t) {
		t.Run(file, func(t *testing.T) {
			out, err := exec.Command(shellcheck, "-x", "-S", "warning", "-e", "SC2034", file).CombinedOutput()
			if err != nil {
				t.Fatalf("shellcheck %s = %v\n%s", file, err, out)
			}
		})
	}
}

// TestBatsSuite runs the bats suite in tests/. It is the check the bead names
// by hand: the six scripts, the fakes, and the acceptance items of dv-cgu.
//
// bats is not on PATH on every machine (it is a test-only dependency, and the
// suite's fakes need nothing else), so its absence skips this check rather than
// failing the gate. GT_BATS names a bats binary to use instead of the one on
// PATH, which is how a gate that keeps its tools outside PATH runs it anyway.
func TestBatsSuite(t *testing.T) {
	bats := os.Getenv("GT_BATS")
	if bats == "" {
		found, err := exec.LookPath("bats")
		if err != nil {
			t.Skip("bats is not on PATH (set GT_BATS to a bats binary); skipping the script suite")
		}
		bats = found
	}

	ctx, cancel := context.WithTimeout(t.Context(), 5*time.Minute)
	defer cancel()

	cmd := exec.CommandContext(ctx, bats, "tests")
	cmd.Dir = "."
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("bats tests = %v\n%s", err, out)
	}
	if strings.Contains(string(out), "not ok") {
		t.Fatalf("bats reported a failing test\n%s", out)
	}
}

// TestNoHostSpecificPaths fails if any file in the package names a path that
// only exists on the machine the scripts were written on. Every script must
// work wherever the deploy runner puts it (docs/design.md, section 5).
func TestNoHostSpecificPaths(t *testing.T) {
	err := filepath.WalkDir(".", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		b, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, needle := range forbidden {
			if strings.Contains(string(b), needle) {
				t.Errorf("%s contains %q", path, needle)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walk scripts/release: %v", err)
	}
}
