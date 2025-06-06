// versioning.js

const suffixes = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z'];

// Helper function to parse version into major, minor, patch, and suffix
function parseVersion(versionStr) {
  // if the version is a number, convert it to a string
  if (typeof versionStr === 'number') {
    versionStr = getVersionFromNumber(versionStr);
  }
  const [major, minor, patchSuffix] = versionStr.split('.');
  const patch = parseInt(patchSuffix.replace(/[a-z]+/, ''), 10);
  const suffix = patchSuffix.replace(/\d+/, '');
  // if the version string is not in the correct format, reset the version to 0.0.1a
  if (isNaN(major) || isNaN(minor) || isNaN(patch) || !suffixes.includes(suffix)) {
    return parseVersion('0.0.1a');
  }
  return {
    major: parseInt(major, 10),
    minor: parseInt(minor, 10),
    patch: patch,
    suffix: suffix
  };
}

// Helper function to format version back from components
function formatVersion({ major, minor, patch, suffix }) {
  return `${major}.${minor}.${patch}${suffix}`;
}

// 1. incrementVersion: Increments the numeric part first, and rolls to the next suffix when needed
function incrementVersion(version) {
  if (!version || version === '0.0.0a') {
    return '0.0.1a';
  }
  let { major, minor, patch, suffix } = parseVersion(getVersion(version));
  const suffixIndex = suffixes.indexOf(suffix);

  // Increment patch first
  patch++;

  // If patch exceeds 99, reset patch and increment minor
  if (patch > 99) {
    patch = 0;
    minor++;
  }

  // If minor exceeds 99, reset minor and increment major
  if (minor > 99) {
    minor = 0;
    major++;
  }

  // If major, minor, and patch hit their maximum (99.99.99), reset and increment suffix
  if (major > 99 && minor === 0 && patch === 0 && suffixIndex < suffixes.length - 1) {
    major = 0;
    minor = 0;
    patch = 1; // Start at 1 when suffix changes
    suffix = suffixes[suffixIndex + 1];
  }

  return formatVersion({ major, minor, patch, suffix });
}

// 2. tagVersion: Swaps or adds the tag to the version, and increments the version
function tagVersion(version, newTag) {
  let incrementedVersion = incrementVersion(version); // Increment version before tagging
  return incrementedVersion + (newTag ? `-${newTag}` : '');
}

// 3. getVersionTag: Returns the tag, or undefined if no tag (without hyphen)
function getVersionTag(version) {
  let tagMatch = version.match(/-(.*)$/);
  return tagMatch ? tagMatch[1] : undefined;
}

// 4. getVersion: Returns the version part of the string (without tag)
function getVersion(version) {
  return version.split ? version.split('-')[0] : version; // Splitting the version and ignoring the tag
}

// 5. getVersionAsNumber: Returns a numeric representation for comparison
function getVersionAsNumber(version) {
  let { major, minor, patch, suffix } = parseVersion(getVersion(version));
  const suffixIndex = suffixes.indexOf(suffix);
  return major * 1000000 + minor * 10000 + patch * 100 + suffixIndex;
}

// 6. getVersionFromNumber: Converts a number back into a version string, with lower bounds returning '0.0.1a'
function getVersionFromNumber(versionNumber) {
  // If the version number is lower than the minimum valid version, return '0.0.1a'
  if (versionNumber < 100) {
    return '0.0.1a';
  }

  let major = Math.floor(versionNumber / 1000000);
  versionNumber %= 1000000;
  let minor = Math.floor(versionNumber / 10000);
  versionNumber %= 10000;
  let patch = Math.floor(versionNumber / 100);
  let suffixIndex = versionNumber % 100;

  return formatVersion({ major, minor, patch, suffix: suffixes[suffixIndex] });
}

function isNewerVersion(potentialNewer, checkAgainst) {
  return getVersionAsNumber(potentialNewer) > getVersionAsNumber(checkAgainst);
}

function isSameVersionNumber(potentialSame, checkAgainst) {
  return getVersionAsNumber(potentialSame) === getVersionAsNumber(checkAgainst);
}

function isSameOrNewerVersion(potentialSameOrNewer, checkAgainst) {
  return getVersionAsNumber(potentialSameOrNewer) >= getVersionAsNumber(checkAgainst);
}

// Exporting all the functions in a Dohver object
const dohver = {
  incrementVersion,
  tagVersion,
  getVersionTag,
  getVersion,
  getVersionAsNumber,
  getVersionFromNumber,
  isNewerVersion,
  isSameVersionNumber,
  isSameOrNewerVersion
};

if (typeof Doh !== 'undefined') {
  Doh.Module('dohver', function (dohver) {
    Doh.Globals.dohver = dohver;
  });
}

export default dohver;

export { dohver };

// export each of the functions
export { incrementVersion, tagVersion, getVersionTag, getVersion, getVersionAsNumber, getVersionFromNumber, isNewerVersion, isSameVersionNumber, isSameOrNewerVersion };
