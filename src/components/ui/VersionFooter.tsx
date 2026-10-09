"use client";

import React, { useEffect, useState } from "react";

import {
  describeVersion,
  type VersionInfo,
  type VersionLabel,
} from "../../lib/version";

/**
 * The line at the bottom of the page saying which build is being served and
 * how long ago it went live. It asks /api/version once, after the page is up,
 * so the page itself stays a static prerender; before the answer arrives there
 * is nothing to show, and if the request fails there is nothing to show then
 * either — a line about the build is not worth an error message, and rendering
 * nothing at all leaves no placeholder to collapse.
 */
export const VersionFooter: React.FC = () => {
  const [version, setVersion] = useState<VersionLabel | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/api/version")
      .then((response) => (response.ok ? response.json() : null))
      .then((info: VersionInfo | null) => {
        // The reader's own clock and zone: the age is how long *they* have
        // been able to see this build.
        if (active && info) setVersion(describeVersion(info, new Date()));
      })
      .catch(() => {
        // Nothing to say, so say nothing.
      });

    return () => {
      active = false;
    };
  }, []);

  if (!version?.text) return null;

  return (
    <footer className="mt-8 text-center text-sm text-gray-600">
      <p title={version.title}>{version.text}</p>
    </footer>
  );
};
