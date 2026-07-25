import semver from "semver";

export function compareVersions(left: string, right: string): number {
  const normalizedLeft = left.trim().replace(/^v/, "");
  const normalizedRight = right.trim().replace(/^v/, "");

  if (semver.valid(normalizedLeft) && semver.valid(normalizedRight)) {
    return semver.compare(normalizedLeft, normalizedRight);
  }

  return normalizedLeft.localeCompare(normalizedRight, undefined, {
    numeric: true,
  });
}

export function isStableVersion(version: string): boolean {
  const parsed = semver.parse(version.trim().replace(/^v/, ""));
  return parsed !== null && parsed.prerelease.length === 0;
}
