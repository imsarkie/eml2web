// Reflows hard-wrapped plain-text lines back into flowing paragraphs.
//
// Mail clients commonly hard-wrap plain-text bodies at a fixed column width
// (no blank line, no RFC 3676 "format=flowed" trailing-space marker to tell
// a wrap-break apart from an intentional one), which would otherwise render
// as literal mid-sentence line breaks in the <pre class="email-body">
// block. A blank line is kept as a paragraph break; a line that looks like
// a numbered list item ("7. ...") or a horizontal rule ("---...") is kept
// on its own line, never merged with what precedes or follows it. Every
// other run of consecutive non-blank lines is joined with a single space
// into one flowing line, the same way a browser would render plain prose.
//
// Runs on the already-escaped/linkified/emphasized HTML text (the output
// of formatBody), not the raw body - so it only ever has to reason about
// newlines and plain punctuation, never about where an escaped entity or a
// tag boundary falls. No tag inserted by formatBody spans multiple lines.

const LIST_ITEM_PATTERN = /^\d+\.\s/;
const RULE_PATTERN = /^-{3,}$/;

function isBreakLine(trimmedLine) {
  return LIST_ITEM_PATTERN.test(trimmedLine) || RULE_PATTERN.test(trimmedLine);
}

export function reflowBody(html) {
  const lines = html.split('\n');
  const outLines = [];
  let current = [];

  const flush = () => {
    if (current.length) {
      outLines.push(current.join(' '));
      current = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') {
      flush();
      // Collapse a run of several blank lines to a single paragraph break.
      if (outLines.length && outLines[outLines.length - 1] !== '') {
        outLines.push('');
      }
    } else if (isBreakLine(trimmed)) {
      flush();
      outLines.push(trimmed);
    } else {
      current.push(trimmed);
    }
  }
  flush();

  return outLines.join('\n');
}
