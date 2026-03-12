const GITHUB_REPO_PATH_REGEX =
  "(VaultSparkStudios/VaultFront|openfrontio/OpenFrontIO)";
const GITHUB_PR_URL_REGEX = new RegExp(
  String.raw`(?<!\()\bhttps:\/\/github\.com\/${GITHUB_REPO_PATH_REGEX}\/pull\/(\d+)\b`,
  "g",
);
const GITHUB_COMPARE_URL_REGEX = new RegExp(
  String.raw`(?<!\()\bhttps:\/\/github\.com\/${GITHUB_REPO_PATH_REGEX}\/compare\/([\w.-]+)\b`,
  "g",
);
const GITHUB_MENTION_REGEX =
  /(^|[^\w/[`])@([a-z\d](?:[a-z\d-]{0,37}[a-z\d])?)(?![\w-])/gim;

export function normalizeNewsMarkdown(markdown: string): string {
  return (
    markdown
      // Convert bold header lines (e.g. "**Title**") into real Markdown headers.
      // Exclude lines starting with - or * to avoid converting bullet points.
      .replace(/^([^\-*\s].*?) \*\*(.+?)\*\*$/gm, "## $1 $2")
      .replace(
        GITHUB_PR_URL_REGEX,
        (match, _repoPath, prNumber) => `[#${prNumber}](${match})`,
      )
      .replace(
        GITHUB_COMPARE_URL_REGEX,
        (match, _repoPath, comparison) => `[${comparison}](${match})`,
      )
      .replace(
        GITHUB_MENTION_REGEX,
        (_match, prefix, username) =>
          `${prefix}[@${username}](https://github.com/${username})`,
      )
  );
}
