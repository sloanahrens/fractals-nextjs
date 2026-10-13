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

	gcp "gt.local/devops/internal/gcp"
	"gt.local/devops/pkg/manifest"
)

// forbidden are the substrings no file under scripts/release may contain: the
// operator's home directory, and the per-session scratch tree an earlier
// wizard was authored in. Both are assembled at run time because this file
// lives under scripts/release and would otherwise trip the scan it performs
// (the same trick as ops/ops_test.go).
var forbidden = []string{"/Users/" + "sloan", "claude-" + "501"}

// commands are every script in this directory that is a command, in the order a
// first release uses them: the one-time stack creation init_stack.sh (bead
// dv-dw4), then the six steps of the flow, then the two reads a job makes of
// what a step left behind -- staged_digest.sh, the digest the prod job reads out
// of the staging stack's state before it promotes (bead dv-yf4), and
// wait_version.sh, the commit the integration job reads out of the deployed
// service (bead dv-5jrh).
//
// build_push_staging.sh is not one of the flow's steps: it is the landing
// build, the script workflows/staging.yml runs on every push to main, and it
// sits beside build_push.sh rather than in the release that script starts (bead
// dv-pj9). It is on this list because everything here is about being a command
// in this directory -- present, executable, parsing and clean under shellcheck
// -- and it is a command.
//
// digest_for_tag.sh is not a step of the flow either: it is the read the `up`
// flow makes of the registry, turning a released tag back into the digest a
// teardown left nothing else naming (bead dv-35th), and it is on this list for
// the same reason build_push_staging.sh is.
var commands = []string{
	"init_stack.sh",
	"build_push.sh",
	"build_push_staging.sh",
	"mint_token.sh",
	"preview.sh",
	"up.sh",
	"promote.sh",
	"digest_for_tag.sh",
	"staged_digest.sh",
	"health.sh",
	"wait_version.sh",
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

// TestReleaseScriptsArePresent checks every script of the directory is there
// and executable. Git records the mode, so a lost exec bit is a shipped
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

// TestBatsSuite runs the bats suite in tests/. It is the check the beads name
// by hand: the scripts, the fakes, the acceptance items of dv-cgu, and the
// credentials and stack creation of dv-dw4.
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

// TestTheReleaseScriptsImpersonateTheAccountBootstrapCreates ties the release
// path's one cloud identity to the app's reviewed manifest (beads dv-4fu and
// dv-iou).
//
// A release mints a one-hour token for the app's deployer service account, and
// lib.sh's deployer_sa is the only place that account is named:
// deployer-<app>@<project>. Bootstrap creates that same account from the
// manifest's app field, so an app name that differs between the two sides is a
// release that cannot mint a token at all -- which is exactly the disagreement
// the manifest's app field and the workflow's GT_APP had before dv-4fu. The test
// reads the reviewed manifest and runs the shell function the scripts run,
// rather than restating either derivation, so a change to lib.sh alone fails
// here.
func TestTheReleaseScriptsImpersonateTheAccountBootstrapCreates(t *testing.T) {
	m, err := manifest.Load(filepath.Join("..", "..", "manifests", "fractals.yaml"))
	if err != nil {
		t.Fatalf("load manifests/fractals.yaml: %v", err)
	}

	// The environment a release runs in: APP and PROJECT are what release_target
	// resolves GT_APP and GT_PROJECT into.
	cmd := exec.Command("bash", "-c", ". ./lib.sh; deployer_sa")
	cmd.Env = append(os.Environ(), "APP="+m.App, "PROJECT="+m.Project)
	out, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("deployer_sa with APP=%s PROJECT=%s: %v\n%s", m.App, m.Project, err, out)
	}

	got := strings.TrimSpace(string(out))
	want := gcp.DeployerServiceAccountEmail(m.App, m.Project)
	if got != want {
		t.Errorf("the release scripts impersonate %q, want %q, the account bootstrap creates from the same manifest", got, want)
	}
	// The literal is the name the two derivations have to land on for this app:
	// a release for fractals-nextjs impersonates deployer-fractals-nextjs in
	// gt-fractals-m4xq (manifests/fractals.yaml).
	if want := "deployer-fractals-nextjs@gt-fractals-m4xq.iam.gserviceaccount.com"; got != want {
		t.Errorf("the release scripts impersonate %q, want %q", got, want)
	}
}
