// Command deploy is the Pulumi program this app ships: it reads the
// deployment's settings from the stack config in Pulumi.<env>.yaml and hands
// them to gt.local/devops/pkg/appdeploy, which turns them into a Cloud Run
// service (devops docs/design.md, section 4).
//
// The release flow runs it, never a person: scripts/release/preview.sh and
// up.sh run `pulumi` against this directory at a release tag, and the only
// value a release changes is imageDigest. Nothing here holds a credential —
// the deploy runner supplies the app's deployer service account token to the
// Pulumi process (scripts/release/README.md).
package main

import (
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
	spec := appdeploy.Spec{Name: c.Require("name"), Env: c.Require("env"), Project: c.Require("project"), Region: c.Require("region"),
		ImageDigest: c.Require("imageDigest"), Port: c.GetInt("port"), HealthPath: c.Require("healthPath"), Memory: c.Require("memory")}
	result, err := appdeploy.Run(ctx, spec)
	if err != nil {
		return err
	}
	ctx.Export("url", result.URL)
	return nil
}
