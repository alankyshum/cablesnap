/** Remove internal issue and branch references from release-note text. */
export function stripInternalRefs(line: string): string {
  let result = line
    // Remove the complete markdown link when either its label or target is internal.
    .replace(
      /\(\s*\[[^\]]*\]\([^)]*bld(?:-\d+|\/)[^)]*\)\s*\)/gi,
      ""
    )
    .replace(
      /\[[^\]]*bld(?:-\d+|\/)[^\]]*\]\([^)]*\)/gi,
      ""
    );

  // The optional leading hyphen handles tokens attached to words such as
  // "post-BLD-485". Branch names are also commonly suffixed with hyphenated
  // words; consume those as one internal token.
  result = result.replace(
    /-?bld-\d+(?:-[a-z0-9]+(?:[-/][a-z0-9]+)*)?/gi,
    ""
  );

  // Keep public references in mixed groups, while removing parentheses that
  // contained only internal references.
  result = result
    .replace(/\(\s*(?:,\s*)*\)/g, "")
    .replace(/\(\s*,/g, "(")
    .replace(/,\s*\)/g, ")")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,)])/g, "$1")
    .replace(/[ \t]+$/, "");

  return result.trim();
}

export function stripHtmlComments(markdown: string): string {
  return markdown
    .replace(/^[ \t]*<!--[\s\S]*?-->[ \t]*(?:\r?\n[ \t]*\r?\n|\r?\n|$)/gm, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}
