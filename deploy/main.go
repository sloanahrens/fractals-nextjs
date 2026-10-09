// Command deploy is the Pulumi program this app ships: it reads the
// deployment's settings from the stack config in Pulumi.<env>.yaml and hands
// them to gt.local/devops/pkg/appdeploy, which turns them into a Cloud Run
// service (devops docs/design.md, section 4).
//
// The release flow runs it, never a person: scripts/release/preview.sh and
// up.sh run `pulumi` against this directory at a release tag, and the two
// values a release writes are imageDigest (the digest the build printed) and
// deployedAt (the time that digest was applied). Nothing here holds a
// credential — the deploy runner supplies the app's deployer service account
// token to the Pulumi process (scripts/release/README.md).
package main

import (
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi/config"

	"gt.local/devops/pkg/appdeploy"
)

func main() {
	pulumi.Run(program)
}

// program is main's body, kept apart from main so a test can run it against a
// mock provider instead of a cloud (see main_test.go).
func program(ctx *pulumi.Context) error {
	c := config.New(ctx, "")
	vars, err := envVars(c)
	if err != nil {
		return err
	}
	spec := appdeploy.Spec{Name: c.Require("name"), Env: c.Require("env"), Project: c.Require("project"), Region: c.Require("region"),
		ImageDigest: c.Require("imageDigest"), Port: c.GetInt("port"), HealthPath: c.Require("healthPath"), Memory: c.Require("memory"),
		EnvVars: vars}
	result, err := appdeploy.Run(ctx, spec)
	if err != nil {
		return err
	}
	ctx.Export("url", result.URL)
	return nil
}

// envVars is the plain configuration the container is started with. The stack
// config carries one optional value here, deployedAt: the time the release
// flow applied the image it is deploying, which it writes into the stack's
// config before the apply when the image changes (set_deployed_at_config in
// the devops repo's scripts/release/lib.sh). The running app reads it back as
// DEPLOYED_AT and shows it as the time this revision went live
// (src/lib/version.ts).
//
// Absent means the stack holds no deploy time — a stack that has not been
// released yet, or the apply a release makes when the digest is unchanged and
// it therefore records nothing — and then no variable is set at all. An empty
// DEPLOYED_AT would be a value the app has to throw away, so "no deploy time"
// has one spelling here, not two.
//
// A present value is checked before it is passed on, and a bad one fails the
// deploy rather than reaching the app. The page tells a viewer when the
// revision they are looking at went live, so a timestamp the app cannot
// vouch for is worse than none at all.
func envVars(c *config.Config) (map[string]string, error) {
	deployedAt, err := c.Try("deployedAt")
	if errors.Is(err, config.ErrMissingVar) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := checkDeployedAt(deployedAt); err != nil {
		return nil, err
	}
	return map[string]string{"DEPLOYED_AT": deployedAt}, nil
}

// checkDeployedAt refuses anything that is not the timestamp the release flow
// writes: RFC 3339 in UTC, with the Z designator — 2026-10-09T00:14:07Z. The
// release side checks the same shape before it writes the value (is_rfc3339_utc,
// same file as set_deployed_at_config); this is the check at the reading end,
// because a stack's config can also be set by hand, and a hand-set value is one
// no release stands behind.
func checkDeployedAt(value string) error {
	if !strings.HasSuffix(value, "Z") {
		return fmt.Errorf("deployedAt %q is not UTC: a deploy time is an RFC 3339 timestamp in UTC, like 2026-10-09T00:14:07Z", value)
	}
	if _, err := time.Parse(time.RFC3339, value); err != nil {
		return fmt.Errorf("deployedAt %q is not an RFC 3339 timestamp like 2026-10-09T00:14:07Z", value)
	}
	return nil
}
