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
	"fmt"
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
var forbidden = []string{"/Users/" + "s" + "loan", "claude-" + "501"}

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
			declareInputs()
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
			declareInputs()
			out, err := exec.Command(shellcheck, "-x", "-S", "warning", "-e", "SC2034", file).CombinedOutput()
			if err != nil {
				t.Fatalf("shellcheck %s = %v\n%s", file, err, out)
			}
		})
	}
}

// batsBudget is how long the bats suite in tests/ may run before it is stopped,
// and it is a measurement rather than a round number (bead dv-psid).
//
// What the suite costs is what 158 checks cost: a process spawn each, on a fake
// clock, so nothing waits for time to pass. The same 158 checks were measured
// at 121.3s and at 181.9s on this host on 2026-10-16 -- 113.4s of the first is
// inside the checks themselves and the rest is bats starting them -- and the
// difference between those runs is what the machine's own load is worth to a
// suite this size. This host is shared with every other session the town is
// running, so an idle CPU is the exception rather than the rule, and the gate
// adds its own load on top: `go test ./...` starts the test binary of every
// package side by side, four of the packages beside this one run bats suites of
// their own, and ops/wizards runs its shell harnesses in parallel (dv-befl).
// Six of those heavy packages beside this one put the package at 210.9s; the
// whole gate put it at 344.7s.
//
// So the five minutes this suite used to be given was 1.6x the 181.9s it cost
// on the day it failed, which is less than the gate's own load is worth, and
// the child was killed while it was still working: the gate printed
// `FAIL gt.local/devops/scripts/release 344.693s` on
// polecat/halyard/dv-wg4y+mvbawb1u, a branch that changes nothing here (dv-psid).
//
// Eight minutes was that measured cost with room to be wrong in: 1.4x the 344.7s
// the package cost under the gate's load, and 2.3x the 210.9s a fan-out of the
// gate's heavy packages cost it. It is also as much as this package can be
// given. go test stops a package at its own -timeout, ten minutes by default
// and the gate names none, so a budget at or past that could never be the
// failure a reader sees -- the package's timeout panic would be, with the
// suite's output lost. Sizing the budget to the load above is a promise about
// this much load; a kill that does happen says which budget ran out, so the
// next reader can tell a busier gate from a broken script.
//
// Two gt done runs on 2026-10-16 then reported this package at 372.9s and
// 385.1s, with the host's load at 21-26 on 24 cores and three gates running
// (bead dv-5og9): 62% of the ten minutes go test allows, spent by one bats
// process running 16 files one after another. The files do not share anything
// -- every check works in its own BATS_TEST_TMPDIR -- so TestBatsSuite now
// starts one bats per file and lets them run side by side, which needs no GNU
// parallel, and the budget is each file's, all of them running at once.
//
// Measured on 2026-10-16 with 24 busy loops beside the test, a load of 27-37 on
// 24 cores. One bats over the 16 files, a file after another, took 163s (the
// five slowest: build_push_staging 63s, build_push 16s, secrets 12s,
// wait_version 11s, deploy 9s; 40s with no loops on a host at load 9). Side by
// side the package took 99.7s and 111.3s, and the slowest file took 92.7s and
// 102.9s: build_push_staging, whose 19 checks each start a git checkout and a
// script that calls git, so it is the file that gets nothing from the others
// running beside it. build_push and build_push_staging now copy one checkout
// made per file (copy_checkout in tests/helpers.bash) rather than running git
// init, add, commit and tag for every check; on the loaded host that took the
// staging file from 43-72s to 30-62s, which is within what the host's other
// sessions move it by.
//
// The budget stays eight minutes. The slowest file under that load costs 103s,
// which is 4.7x of margin to the budget and the package's 111s is 5.4x of
// margin to the ten minutes go test allows, against the 1.6x the suite had
// when it was killed (dv-psid).
const batsBudget = 8 * time.Minute

// batsTestTimeout is the bound on any ONE bats test, set for bats as
// BATS_TEST_TIMEOUT (bats-core 1.14 stops the test and reports `not ok N <name> #
// timeout after Ns`). The suite budget above bounds the whole file, so a single
// hung test used to spend all of it: the 10-minute kills of 2026-10-22 and 10-23
// (dv-gqbk, dv-honu.7) were one test that never finished while the others passed.
// With this bound the hang fails alone, in a minute, under its own name.
//
// Measured on 2026-10-23 with `bats -T tests`: the slowest legitimate test in
// the suite takes 1.9 s and the next 1.6 s, so a minute is about 30 times what
// any test needs. A test that needs more is a test to cut or move to the
// integration tier, not a reason to raise this (dv-88al).
const batsTestTimeout = 60 * time.Second

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

	files, err := filepath.Glob("tests/*.bats")
	if err != nil {
		t.Fatalf("glob tests/*.bats: %v", err)
	}
	if len(files) == 0 {
		t.Fatal("no bats files match tests/*.bats")
	}
	for _, file := range files {
		t.Run(filepath.Base(file), func(t *testing.T) {
			t.Parallel()
			if err := runBatsSuite(t.Context(), bats, file, batsBudget); err != nil {
				t.Fatal(err)
			}
		})
	}
}

// runBatsSuite runs bats over dir under a budget and returns what went wrong,
// or nil when the suite passed.
//
// The ways this can fail are kept apart because they call for different
// answers: a suite that exited by itself is a broken script or a broken bats --
// what it printed says which -- while a child that was still running when its
// budget ran out is a question about the machine the gate is on rather than
// about the scripts (dv-psid). Only the last one is worth a message that says
// how long it ran and which budget it ran against, and that is the reason this
// is a function rather than a few lines inside the test: the stand-ins in
// bats_test.go go through the same door.
func runBatsSuite(ctx context.Context, bats, dir string, budget time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, budget)
	defer cancel()

	declareInputs()
	cmd := exec.CommandContext(ctx, bats, dir)
	cmd.Dir = "."
	cmd.Env = append(os.Environ(), fmt.Sprintf("BATS_TEST_TIMEOUT=%d", int(batsTestTimeout.Seconds())))
	// A suite that is stopped leaves the subshells of the checks it was
	// running behind, and they hold the pipe the output is read from. Without a
	// delay here, the wait this budget exists to bound could be followed by
	// minutes of waiting on orphans: bats itself is gone by then, so this only
	// ever costs time when a check left something running.
	cmd.WaitDelay = 15 * time.Second

	start := time.Now()
	out, err := cmd.CombinedOutput()
	ran := time.Since(start).Round(time.Second)

	switch {
	case ctx.Err() != nil:
		return fmt.Errorf("the bats suite was still running when its %s budget ran out and was stopped after %s (bead dv-psid). Every test is bound by BATS_TEST_TIMEOUT=%ds, so one hung test is stopped long before this; reaching the suite budget means many tests were slow at once, which is a cost to cut and not a budget to raise. What it printed:\n%s", budget, ran, int(batsTestTimeout.Seconds()), out)
	case err != nil:
		return fmt.Errorf("bats %s = %v after %s%s\n%s", dir, err, ran, timeoutNote(out), out)
	case strings.Contains(string(out), "not ok"):
		return fmt.Errorf("bats reported a failing test%s\n%s", timeoutNote(out), out)
	}
	return nil
}

// timeoutNote names BATS_TEST_TIMEOUT when bats stopped a test for it, so a hung
// test reads as a hang to cut and not as a broken script: bats prints `# timeout
// after Ns` on the test's own `not ok` line. It is empty when no test timed out.
func timeoutNote(out []byte) string {
	if !strings.Contains(string(out), "timeout after") {
		return ""
	}
	return fmt.Sprintf(" (a test was stopped by BATS_TEST_TIMEOUT=%ds: it hung or ran far past what any test here needs; find why it did not finish, do not raise the timeout)", int(batsTestTimeout.Seconds()))
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
	declareInputs()
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
