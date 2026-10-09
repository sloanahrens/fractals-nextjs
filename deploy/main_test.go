package main

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"regexp"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/pulumi/pulumi/sdk/v3/go/common/resource"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
	"gopkg.in/yaml.v3"
)

// What the deployment is, from Pulumi.yaml and Pulumi.<env>.yaml. The app's
// name is the repository name, which is what the deploy workflow's GT_APP
// defaults to; the Pulumi project is the name the patrol finds this app's
// state under, so it is fixed in two places and asserted here.
const (
	pulumiProject = "fractals"
	appName       = "fractals-nextjs"

	// The service internal/gcp.ServiceName names for the staging stack:
	// <app name>-<env>.
	stagingEnv     = "staging"
	stagingService = "fractals-nextjs-staging"

	region      = "us-central1"
	port        = 8080
	healthPath  = "/api/health"
	memory      = "512Mi"
	minScale    = 0
	maxScale    = 3
	concurrency = 80

	// The resource types a deployment creates, as Pulumi names them.
	serviceType   = "gcp:cloudrunv2/service:Service"
	iamMemberType = "gcp:cloudrunv2/serviceIamMember:ServiceIamMember"
)

// The deployment's identity, read from the stack config files rather than
// written here. The project is the one value in it that this repository names
// in several places, so the files the program itself reads are where the test
// reads it from: a rename is an edit to them, and to what they cannot reach
// (fr-hz5). loadStackFixture fills these in before any test runs.
var (
	// project is the GCP project the deployment creates its service in, the
	// one the reviewed manifest bootstraps (devops manifests/fractals.yaml).
	project string

	// runtimeAccount is the account the container runs as. The library derives
	// it from the app and the project (devops internal/gcp,
	// RuntimeServiceAccountEmail), so a rename moves it with them.
	runtimeAccount string

	// testDigest stands in for the digest a release pins, which a stack config
	// file does not carry: scripts/release/preview.sh sets imageDigest from the
	// digest build_push.sh printed. Only the digest travelling into the
	// container unchanged is under test, so any sha256 does; its path is the
	// one the release flow builds (scripts/release/lib.sh, release_target).
	testDigest string
)

// testDigestHex is that digest, as build_push.sh prints it: the sha256 the
// registry reports for the image, with no path in front of it.
const testDigestHex = "9f2b1c0d3e4a5b6c7d8e9f0a1b2c3d4e5f60718293a4b5c6d7e8f9a0b1c2d3e4"

// serviceURI is the address the mock provider reports for a created service.
// The .invalid domain is reserved for exactly this (RFC 2606), so nothing here
// can be mistaken for a deployed app.
const serviceURI = "https://fractals-nextjs-staging.invalid/"

// stackFiles are the stack configuration files this repository ships, keyed by
// the environment each configures. Pulumi reads Pulumi.<stack>.yaml, and the
// stacks are the two environments the reviewed manifest deploys to
// (devops manifests/fractals.yaml), so a file name and the env value inside it
// have to agree.
var stackFiles = map[string]string{"staging": "Pulumi.staging.yaml", "prod": "Pulumi.prod.yaml"}

// specKeys are the config keys the program reads, named as the devops example
// program names them (devops examples/app/main.go). A key outside this set is
// a value the program never sees.
var specKeys = []string{"name", "env", "project", "region", "imageDigest", "port", "healthPath", "memory", "deployedAt"}

// releaseKeys are the keys a release writes rather than the repository
// shipping them (scripts/release/lib.sh, set_digest_config and
// set_deployed_at_config).
var releaseKeys = []string{"imageDigest", "deployedAt"}

// deployedAtKey is the stack config key the release flow records its apply time
// under, and testDeployedAt is what an apply of this stack would leave there:
// the UTC RFC 3339 timestamp set_deployed_at_config writes.
const (
	deployedAtKey  = "deployedAt"
	testDeployedAt = "2026-10-09T00:14:07Z"
)

// TestMain reads the deployment's identity out of the stack config files
// before the tests run. The fixture is what those files say, so a checkout
// where they cannot be read has nothing to test.
func TestMain(m *testing.M) {
	if err := loadStackFixture(); err != nil {
		fmt.Fprintln(os.Stderr, "deploy fixture:", err)
		os.Exit(1)
	}
	os.Exit(m.Run())
}

// loadStackFixture fills project, runtimeAccount and testDigest from the stack
// config files. The project comes from the staging stack's file, the one
// TestProgramDeploysTheConfiguredApp deploys; TestBothStacksConfigureThisApp
// holds the prod file to the same project, because the two stacks are this one
// app in one project.
func loadStackFixture() error {
	file := stackFiles[stagingEnv]
	config, err := readStackConfig(file)
	if err != nil {
		return err
	}

	key := pulumiProject + ":project"
	got := config[key]
	if got == "" {
		return fmt.Errorf("%s names no GCP project (%s)", file, key)
	}
	project = got
	runtimeAccount = fmt.Sprintf("runtime-%s@%s.iam.gserviceaccount.com", appName, project)
	testDigest = fmt.Sprintf("%s-docker.pkg.dev/%s/apps/%s@sha256:%s", region, project, appName, testDigestHex)
	return nil
}

// TestProgramDeploysTheConfiguredApp runs the program the way the release flow
// runs it -- its program, under the mock provider, with the staging stack's
// own config file -- and asserts what a deploy of this app produces: one Cloud
// Run service named fractals-nextjs-staging, with the labels, image, scaling,
// runtime account and container settings the spec and the library fix, plus
// its public invoker binding and the URL the program exports.
func TestProgramDeploysTheConfiguredApp(t *testing.T) {
	monitor, exports := deploy(t, "staging")

	if want := []string{serviceType, iamMemberType}; !slices.Equal(slices.Sorted(slices.Values(monitor.created)), slices.Sorted(slices.Values(want))) {
		t.Errorf("the deployment created %v, want exactly %v", monitor.created, want)
	}

	service := monitor.service(t)
	if got := stringProp(t, service, "name"); got != stagingService {
		t.Errorf("the service is named %q, want %q", got, stagingService)
	}
	if got, want := stringMapProp(t, service, "labels"), map[string]string{
		"app": appName, "env": stagingEnv, "managed-by": "pulumi", "owner": "gastown",
	}; !maps.Equal(got, want) {
		t.Errorf("the service labels are %v, want %v", got, want)
	}
	if got := stringProp(t, service, "project"); got != project {
		t.Errorf("the service is in project %q, want %q", got, project)
	}
	if got := stringProp(t, service, "location"); got != region {
		t.Errorf("the service is in %q, want %q", got, region)
	}

	scaling := objectProp(t, service, "scaling")
	if got := numberProp(t, scaling, "minInstanceCount"); got != minScale {
		t.Errorf("minInstanceCount is %v, want %v: the service scales to zero", got, minScale)
	}
	if got := numberProp(t, scaling, "maxInstanceCount"); got != maxScale {
		t.Errorf("maxInstanceCount is %v, want the library default %v", got, maxScale)
	}

	template := objectProp(t, service, "template")
	if got := stringProp(t, template, "serviceAccount"); got != runtimeAccount {
		t.Errorf("the container runs as %q, want the app's runtime account %q", got, runtimeAccount)
	}
	if got := numberProp(t, template, "maxInstanceRequestConcurrency"); got != concurrency {
		t.Errorf("the request concurrency is %v, want the library default %v", got, concurrency)
	}

	containers := arrayProp(t, template, "containers")
	if len(containers) != 1 {
		t.Fatalf("the service has %d containers, want one", len(containers))
	}
	container := objectPropValue(t, "template.containers[0]", containers[0])
	if got := stringProp(t, container, "image"); got != testDigest {
		t.Errorf("the container image is %q, want the digest %q", got, testDigest)
	}
	if got := numberProp(t, objectProp(t, container, "ports"), "containerPort"); got != port {
		t.Errorf("the container port is %v, want %v", got, port)
	}
	if got := stringProp(t, objectProp(t, objectProp(t, container, "resources"), "limits"), "memory"); got != memory {
		t.Errorf("the container memory limit is %q, want %q", got, memory)
	}
	httpGet := objectProp(t, objectProp(t, container, "startupProbe"), "httpGet")
	if got := stringProp(t, httpGet, "path"); got != healthPath {
		t.Errorf("the startup probe path is %q, want %q", got, healthPath)
	}
	if got := numberProp(t, httpGet, "port"); got != port {
		t.Errorf("the startup probe port is %v, want %v", got, port)
	}
	if got := containerEnvs(t, container); len(got) != 0 {
		t.Errorf("the container is started with %v, want no environment variables: the stack config holds no deployedAt", got)
	}

	exported, ok := exports["url"]
	if !ok {
		t.Fatalf("the program exported no url; it exported %d outputs", len(exports))
	}
	url, ok := exported.(pulumi.StringOutput)
	if !ok {
		t.Fatalf("the program exported url as %T, want the service URL", exported)
	}
	urls := make(chan string, 1)
	url.ApplyT(func(url string) string { urls <- url; return url })
	select {
	case got := <-urls:
		if want := serviceURI + stagingService; got != want {
			t.Errorf("the exported url = %q, want the provider's URI %q", got, want)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("the url the program exported never resolved")
	}
}

// TestProgramPassesTheDeployedAtConfigToTheContainer runs the program with a
// released stack -- one whose config carries the deployedAt a release wrote --
// and asserts the container is started with that time as DEPLOYED_AT, the
// value the app shows as when this revision went live (src/lib/version.ts).
func TestProgramPassesTheDeployedAtConfigToTheContainer(t *testing.T) {
	monitor, _, err := runProgram(t, "staging", map[string]string{pulumiProject + ":" + deployedAtKey: testDeployedAt})
	if err != nil {
		t.Fatalf("the program failed for a stack with deployedAt set: %v", err)
	}

	containers := arrayProp(t, objectProp(t, monitor.service(t), "template"), "containers")
	container := objectPropValue(t, "template.containers[0]", containers[0])
	if got, want := containerEnvs(t, container), map[string]string{"DEPLOYED_AT": testDeployedAt}; !maps.Equal(got, want) {
		t.Errorf("the container is started with %v, want %v", got, want)
	}
}

// TestBadDeployedAtFailsTheDeploy holds the value a release records to the
// shape the app can use: UTC RFC 3339. Every other shape fails the deploy with
// a message naming the key, and does it before anything reaches the provider,
// so a stack whose config carries a time this app cannot vouch for is not
// deployed at all rather than deployed with a wrong one on the page.
func TestBadDeployedAtFailsTheDeploy(t *testing.T) {
	values := []struct{ name, value string }{
		{"empty", ""},
		{"whitespace", " 2026-10-09T00:14:07Z "},
		{"an offset instead of Z", "2026-10-09T00:14:07+00:00"},
		{"another zone", "2026-10-09T00:14:07-05:00"},
		{"no zone", "2026-10-09T00:14:07"},
		{"a date", "2026-10-09Z"},
		{"the word for it", "yesterday"},
		{"an impossible date", "2026-13-45T99:99:99Z"},
	}
	for _, bad := range values {
		t.Run(bad.name, func(t *testing.T) {
			monitor, _, err := runProgram(t, "staging", map[string]string{pulumiProject + ":" + deployedAtKey: bad.value})
			if err == nil {
				t.Fatalf("the program accepted deployedAt %q, want a refusal", bad.value)
			}
			if got := err.Error(); !strings.Contains(got, deployedAtKey) {
				t.Errorf("the program failed with %q, want a message naming %q", got, deployedAtKey)
			}
			if len(monitor.created) != 0 {
				t.Errorf("the failed deploy created %v, want the refusal to come before anything is created", monitor.created)
			}
		})
	}
}

// TestBothStacksConfigureThisApp holds each stack config file to what the
// program reads from it: the file configures the environment it is named for,
// it names this app and the reviewed manifest's project, it holds every value
// the program requires and no key the program never sees, and it deploys the
// service <app>-<env>.
func TestBothStacksConfigureThisApp(t *testing.T) {
	for env, file := range stackFiles {
		t.Run(env, func(t *testing.T) {
			config := stackConfig(t, file)
			if got := config[pulumiProject+":env"]; got != env {
				t.Errorf("%s sets env %q, want %q: the file configures the stack it is named for", file, got, env)
			}
			if got := config[pulumiProject+":name"]; got != appName {
				t.Errorf("%s names the app %q, want %q", file, got, appName)
			}
			if got := config[pulumiProject+":project"]; got != project {
				t.Errorf("%s deploys to project %q, want %q: the two stacks are one app in one project", file, got, project)
			}

			monitor, _ := deploy(t, env)
			if got, want := stringProp(t, monitor.service(t), "name"), appName+"-"+env; got != want {
				t.Errorf("the %s stack deploys a service named %q, want %q", env, got, want)
			}
		})
	}
}

// TestStackConfigsHoldNoSecrets checks the one place a secret could reach this
// deployment: the config files. The Spec the program builds has no EnvVars at
// all, and appdeploy.Validate refuses an env var whose name names a secret,
// password, token or key, so these files are the whole of what the app passes
// in. A config key outside the Spec's keys, a key that names a credential, or
// a value shaped like key material each fail here.
func TestStackConfigsHoldNoSecrets(t *testing.T) {
	// secretName matches a config key that names a credential, the same
	// pattern appdeploy refuses on an env var name.
	secretName := regexp.MustCompile(`(?i)(secret|password|token|key|credential)`)
	// keyMaterial matches the first line of a PEM file, which is what a key
	// pasted into a config file would carry.
	keyMaterial := regexp.MustCompile(`-----BEGIN|PRIVATE KEY`)

	for env, file := range stackFiles {
		t.Run(env, func(t *testing.T) {
			for key, value := range stackConfig(t, file) {
				name := strings.TrimPrefix(key, pulumiProject+":")
				if secretName.MatchString(name) {
					t.Errorf("%s holds %q, a key that names a credential", file, key)
				}
				if keyMaterial.MatchString(value) {
					t.Errorf("%s holds key material under %q", file, key)
				}
			}
		})
	}
}

// deploy runs the program for a stack the way the release flow does and fails
// the test if the program fails.
func deploy(t *testing.T, env string) (*deployMonitor, map[string]pulumi.Input) {
	t.Helper()
	monitor, exports, err := runProgram(t, env, nil)
	if err != nil {
		t.Fatalf("the program failed for the %s stack: %v", env, err)
	}
	return monitor, exports
}

// runProgram runs the program for a stack the way the release flow does -- its
// program, under the mock provider, with the environment's own config file, a
// digest standing in for the one a release pins, and whatever else a test sets
// on top of the file -- and returns what the provider was asked to create,
// what the program exported, and the error the program returned.
func runProgram(t *testing.T, env string, extra map[string]string) (*deployMonitor, map[string]pulumi.Input, error) {
	t.Helper()
	file, ok := stackFiles[env]
	if !ok {
		t.Fatalf("no stack config file for %q", env)
	}
	config := stackConfig(t, file)
	config[pulumiProject+":imageDigest"] = testDigest
	for key, value := range extra {
		config[key] = value
	}

	rendered, err := json.Marshal(config)
	if err != nil {
		t.Fatalf("render the config: %v", err)
	}
	t.Setenv(pulumi.EnvConfig, string(rendered))

	monitor := &deployMonitor{}
	var exports map[string]pulumi.Input
	err = pulumi.RunErr(func(ctx *pulumi.Context) error {
		if err := program(ctx); err != nil {
			return err
		}
		exports = ctx.GetCurrentExportMap()
		return nil
	}, pulumi.WithMocks(pulumiProject, env, monitor))
	return monitor, exports, err
}

// stackConfig reads a stack's config file and holds its keys to what the
// program reads: a config block whose every key is namespaced with the Pulumi
// project name. A key namespaced for another project, a key the program never
// reads, or a value that is not a plain string is a value the program cannot
// see, so each one fails the read rather than being ignored.
func stackConfig(t *testing.T, file string) map[string]string {
	t.Helper()
	config, err := readStackConfig(file)
	if err != nil {
		t.Fatal(err)
	}

	for key := range config {
		namespace, name, ok := strings.Cut(key, ":")
		if !ok || namespace != pulumiProject {
			t.Errorf("%s sets %q, which is not namespaced for the Pulumi project %q (Pulumi.yaml)", file, key, pulumiProject)
			continue
		}
		if !slices.Contains(specKeys, name) {
			t.Errorf("%s sets %q, which the program never reads; it reads %v", file, key, specKeys)
		}
		if slices.Contains(releaseKeys, name) {
			t.Errorf("%s sets %q, which a release pins (scripts/release/lib.sh), not the repository", file, key)
		}
	}
	return config
}

// readStackConfig reads a stack's config file the way Pulumi reads it: the
// config block, parsed. It reports what it cannot read; whether a key belongs
// in one of these files is stackConfig's question.
func readStackConfig(file string) (map[string]string, error) {
	data, err := os.ReadFile(file)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", file, err)
	}
	var doc struct {
		Config map[string]string `yaml:"config"`
	}
	if err := yaml.Unmarshal(data, &doc); err != nil {
		return nil, fmt.Errorf("parse %s: %w", file, err)
	}
	if len(doc.Config) == 0 {
		return nil, fmt.Errorf("%s has no config block", file)
	}
	return doc.Config, nil
}

// deployMonitor stands in for the provider: it records every resource
// registration and answers a Cloud Run service with the URI the provider
// reports, so the program runs end to end with no credential and no network
// call.
//
// It does not run resource transforms, because the SDK's mock monitor
// deliberately does not (pulumi's mocks.go: "the mock monitor does not run
// transforms"), and the deploy policy is one. The policy is the library's, and
// it is exercised where it lives (pkg/appdeploy/policy_test.go).
type deployMonitor struct {
	created []string               // type tokens of the resources that reached the provider
	inputs  []resource.PropertyMap // their inputs, in the same order
}

func (m *deployMonitor) NewResource(args pulumi.MockResourceArgs) (string, resource.PropertyMap, error) {
	state := make(resource.PropertyMap, len(args.Inputs)+1)
	for key, value := range args.Inputs {
		state[key] = value
	}
	if args.TypeToken == serviceType {
		state[resource.PropertyKey("uri")] = resource.NewStringProperty(serviceURI + args.Name)
	}

	m.created = append(m.created, args.TypeToken)
	m.inputs = append(m.inputs, state)
	return args.Name + "-id", state, nil
}

// Call implements pulumi.MockResourceMonitor. The program invokes no provider
// functions.
func (m *deployMonitor) Call(pulumi.MockCallArgs) (resource.PropertyMap, error) {
	return resource.PropertyMap{}, nil
}

// service returns the inputs of the one Cloud Run service the deployment
// created.
func (m *deployMonitor) service(t *testing.T) resource.PropertyMap {
	t.Helper()
	for i, typ := range m.created {
		if typ == serviceType {
			return m.inputs[i]
		}
	}
	t.Fatalf("the deployment created no %s; it created %v", serviceType, m.created)
	return nil
}

// objectProp returns the object under key, failing the test when it is absent
// or is another kind of value.
func objectProp(t *testing.T, m resource.PropertyMap, key string) resource.PropertyMap {
	t.Helper()
	value, ok := m[resource.PropertyKey(key)]
	if !ok {
		t.Fatalf("no %q in %s", key, render(m))
	}
	return objectPropValue(t, key, value)
}

func objectPropValue(t *testing.T, name string, value resource.PropertyValue) resource.PropertyMap {
	t.Helper()
	if !value.IsObject() {
		t.Fatalf("%s is %s, want an object", name, render(value))
	}
	return value.ObjectValue()
}

// arrayProp returns the array under key, failing the test when it is absent or
// is another kind of value.
func arrayProp(t *testing.T, m resource.PropertyMap, key string) []resource.PropertyValue {
	t.Helper()
	value, ok := m[resource.PropertyKey(key)]
	if !ok {
		t.Fatalf("no %q in %s", key, render(m))
	}
	return arrayPropValue(t, key, value)
}

// arrayPropValue returns value as an array, failing the test when it is
// another kind of value.
func arrayPropValue(t *testing.T, name string, value resource.PropertyValue) []resource.PropertyValue {
	t.Helper()
	if !value.IsArray() {
		t.Fatalf("%s is %s, want an array", name, render(value))
	}
	return value.ArrayValue()
}

// stringProp returns the string under key, failing the test when it is absent
// or is another kind of value.
func stringProp(t *testing.T, m resource.PropertyMap, key string) string {
	t.Helper()
	value, ok := m[resource.PropertyKey(key)]
	if !ok {
		t.Fatalf("no %q in %s", key, render(m))
	}
	if !value.IsString() {
		t.Fatalf("%q is %s, want a string", key, render(value))
	}
	return value.StringValue()
}

// numberProp returns the number under key, failing the test when it is absent
// or is another kind of value.
func numberProp(t *testing.T, m resource.PropertyMap, key string) float64 {
	t.Helper()
	value, ok := m[resource.PropertyKey(key)]
	if !ok {
		t.Fatalf("no %q in %s", key, render(m))
	}
	if !value.IsNumber() {
		t.Fatalf("%q is %s, want a number", key, render(value))
	}
	return value.NumberValue()
}

// containerEnvs returns the environment variables a container is started with
// as a name-to-value map: the container's `envs` array, which is absent or
// empty for a container started with none.
func containerEnvs(t *testing.T, container resource.PropertyMap) map[string]string {
	t.Helper()
	value, ok := container[resource.PropertyKey("envs")]
	if !ok {
		return nil
	}
	items := arrayPropValue(t, "envs", value)
	envs := make(map[string]string, len(items))
	for i, item := range items {
		env := objectPropValue(t, fmt.Sprintf("envs[%d]", i), item)
		envs[stringProp(t, env, "name")] = stringProp(t, env, "value")
	}
	return envs
}

// stringMapProp returns the object under key as a map of strings, failing the
// test when it is absent, is another kind of value, or holds a non-string.
func stringMapProp(t *testing.T, m resource.PropertyMap, key string) map[string]string {
	t.Helper()
	values := make(map[string]string)
	for name, value := range objectProp(t, m, key) {
		if !value.IsString() {
			t.Fatalf("%s.%s is %s, want a string", key, name, render(value))
		}
		values[string(name)] = value.StringValue()
	}
	return values
}

// render prints a property value or map as the JSON it holds, so a shape this
// test did not expect is legible without a second run.
func render(v any) string {
	data, err := json.Marshal(plain(v))
	if err != nil {
		return "<unprintable>"
	}
	return string(data)
}

// plain unwraps the SDK's property values into the plain Go values they hold,
// so a failure message reads as the resource's inputs rather than as the
// wrapper structs around them.
func plain(v any) any {
	switch value := v.(type) {
	case resource.PropertyMap:
		out := make(map[string]any, len(value))
		for key, item := range value {
			out[string(key)] = plain(item)
		}
		return out
	case resource.PropertyValue:
		switch {
		case value.IsObject():
			return plain(value.ObjectValue())
		case value.IsArray():
			items := value.ArrayValue()
			out := make([]any, len(items))
			for i, item := range items {
				out[i] = plain(item)
			}
			return out
		case value.IsString():
			return value.StringValue()
		case value.IsNumber():
			return value.NumberValue()
		case value.IsBool():
			return value.BoolValue()
		case value.IsNull():
			return nil
		}
		return value.String()
	}
	return v
}
