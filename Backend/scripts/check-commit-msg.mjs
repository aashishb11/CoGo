import { readFileSync } from 'node:fs';
import { argv, exit } from 'node:process';

const file = argv[2];
if (!file) {
  console.error('Usage: check-commit-msg.mjs <commit-msg-file>');
  exit(1);
}

const firstLine = readFileSync(file, 'utf8').split('\n')[0].trim();

if (
  firstLine.startsWith('Merge ') ||
  firstLine.startsWith('Revert ') ||
  firstLine.startsWith('fixup!')
) {
  exit(0);
}

const pattern =
  /^(feat|fix|refactor|test|chore|docs|style|perf)(\([\w.-]+\))?: .+/;

if (!pattern.test(firstLine)) {
  console.error('\n✖ Invalid commit message:');
  console.error(`  "${firstLine}"\n`);
  console.error('Expected format: <type>: <description>');
  console.error(
    'Allowed types:   feat, fix, refactor, test, chore, docs, style, perf',
  );
  console.error('Example:         feat: add user authentication endpoint\n');
  exit(1);
}
