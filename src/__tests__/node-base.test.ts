/**
 * The container base image names one supported Node major, in four places
 *
 * The image build file has two `FROM` lines, the Makefile's `test-docker`
 * recipe runs in the same image, and the README names the Node version in its
 * "Getting started" sentence and in the `make test-docker` comment. Those four
 * places must name the same major, and that major must be 22 or later. Each
 * place is read as text here, and the check is a pure function over that text,
 * so a copy edited in the test shows what the check refuses.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// `import.meta.url` is this file: src/__tests__/, so ".." twice is the root.
const ROOT = fileURLToPath(new URL("../../", import.meta.url));

const MIN_NODE_MAJOR = 22;

/** The text of the three files that hold the four places. */
interface NodeSources {
  dockerfile: string;
  makefile: string;
  readme: string;
}

function readSources(): NodeSources {
  return {
    dockerfile: readFileSync(`${ROOT}Dockerfile`, "utf8"),
    makefile: readFileSync(`${ROOT}Makefile`, "utf8"),
    readme: readFileSync(`${ROOT}README.md`, "utf8"),
  };
}

/** The majors one place names, read from its text. */
interface PlaceMajors {
  place: string;
  majors: number[];
}

function majorsOf(text: string, pattern: RegExp): number[] {
  return [...text.matchAll(pattern)].map((match) => Number(match[1]));
}

/** Every place that names a Node major, and the majors each one names. */
function nodeMajorPlaces(sources: NodeSources): PlaceMajors[] {
  const testDockerRecipe = /^test-docker:\n\t(.*)$/m.exec(sources.makefile)?.[1] ?? "";
  return [
    {
      place: "Dockerfile FROM lines",
      majors: majorsOf(sources.dockerfile, /^FROM node:(\d+)-alpine\b/gm),
    },
    {
      place: "Makefile test-docker recipe",
      majors: majorsOf(testDockerRecipe, /node:(\d+)-alpine/g),
    },
    {
      place: "README Node sentence",
      majors: majorsOf(sources.readme, /^Node (\d+) or later\b/gm),
    },
    {
      place: "README make test-docker comment",
      majors: majorsOf(sources.readme, /^make test-docker\s+#.*node:(\d+)-alpine/gm),
    },
  ];
}

/** What is wrong with the four places, or nothing when they agree and are supported. */
function nodeMajorProblems(sources: NodeSources): string[] {
  const places = nodeMajorPlaces(sources);
  const problems: string[] = [];

  for (const { place, majors } of places) {
    if (majors.length === 0) {
      problems.push(`${place}: names no Node major`);
    }
    for (const major of majors) {
      if (major < MIN_NODE_MAJOR) {
        problems.push(`${place}: node ${major} is below ${MIN_NODE_MAJOR}`);
      }
    }
  }

  const distinct = new Set(places.flatMap((entry) => entry.majors));
  if (distinct.size > 1) {
    const named = places.map((entry) => `${entry.place}=${entry.majors.join("/")}`);
    problems.push(`the places name different majors: ${named.join(", ")}`);
  }

  return problems;
}

/** Replace the one `from` in a copy of a file's text; a miss is a test error, not a pass. */
function replaceOnce(text: string, from: string, to: string): string {
  if (!text.includes(from)) {
    throw new Error(`mutation target not found: ${from}`);
  }
  return text.replace(from, to);
}

describe("the container base image names one supported Node major", () => {
  it("reads the same major from all four places, and it is 22 or later", () => {
    expect(nodeMajorProblems(readSources())).toEqual([]);
  });

  it("refuses a Dockerfile FROM line changed back to node 20", () => {
    const sources = readSources();
    const mutated = {
      ...sources,
      dockerfile: replaceOnce(sources.dockerfile, "FROM node:22-alpine AS builder", "FROM node:20-alpine AS builder"),
    };

    expect(nodeMajorProblems(mutated).join("\n")).toContain("Dockerfile FROM lines: node 20 is below 22");
  });

  it("refuses a Makefile test-docker recipe changed back to node 20", () => {
    const sources = readSources();
    const mutated = {
      ...sources,
      makefile: replaceOnce(sources.makefile, "-w /app node:22-alpine sh -c", "-w /app node:20-alpine sh -c"),
    };

    expect(nodeMajorProblems(mutated).join("\n")).toContain("Makefile test-docker recipe: node 20 is below 22");
  });

  it("refuses a README Node sentence changed back to Node 20", () => {
    const sources = readSources();
    const mutated = {
      ...sources,
      readme: replaceOnce(sources.readme, "Node 22 or later (the", "Node 20 or later (the"),
    };

    expect(nodeMajorProblems(mutated).join("\n")).toContain("README Node sentence: node 20 is below 22");
  });

  it("refuses a README make test-docker comment changed back to node 20", () => {
    const sources = readSources();
    const mutated = {
      ...sources,
      readme: replaceOnce(sources.readme, "in a node:22-alpine container", "in a node:20-alpine container"),
    };

    expect(nodeMajorProblems(mutated).join("\n")).toContain("README make test-docker comment: node 20 is below 22");
  });

  it("refuses places that name different majors, even when both are supported", () => {
    const sources = readSources();
    const mutated = {
      ...sources,
      dockerfile: sources.dockerfile.replace(/^FROM node:\d+-alpine\b/gm, "FROM node:24-alpine"),
    };

    expect(nodeMajorProblems(mutated).join("\n")).toContain("the places name different majors");
  });

  it("refuses a place that names no major, rather than passing it as clean", () => {
    const sources = readSources();
    const mutated = {
      ...sources,
      makefile: replaceOnce(sources.makefile, "-w /app node:22-alpine sh -c", "-w /app alpine sh -c"),
    };

    expect(nodeMajorProblems(mutated).join("\n")).toContain("Makefile test-docker recipe: names no Node major");
  });

  it("refuses all four places at node 20, which is below the floor", () => {
    const sources = readSources();
    const mutated: NodeSources = {
      dockerfile: sources.dockerfile.replace(/^FROM node:\d+-alpine\b/gm, "FROM node:20-alpine"),
      makefile: replaceOnce(sources.makefile, "node:22-alpine", "node:20-alpine"),
      readme: replaceOnce(
        replaceOnce(sources.readme, "Node 22 or later", "Node 20 or later"),
        "node:22-alpine container",
        "node:20-alpine container",
      ),
    };

    const problems = nodeMajorProblems(mutated);
    expect(problems.some((problem) => problem.endsWith("is below 22"))).toBe(true);
    expect(problems.some((problem) => problem.startsWith("the places name different majors"))).toBe(false);
  });
});
